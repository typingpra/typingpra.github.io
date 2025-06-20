// typing.js - タイピングのコア機能

const Typing = {
	// キャッシュ用変数
	cachedTargets: [],
	currentHighlightIndex: -1,
	updatePending: false,

	// 2バイト文字（マルチバイト文字）の判定
	isMultiByteChar(char) {
		// ASCII文字以外を2バイト文字として判定
		// 日本語（ひらがな、カタカナ、漢字）、中国語、韓国語等を含む
		return /[^\x00-\x7F]/.test(char);
	},

	// 現在のモードがTypeWellモードかどうかを判定
	isTypeWellMode() {
		if (DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") {
			return true;
		}

		// カスタムコードでTypeWellモードが選択されている場合
		if (DOM.langSel.value === "custom") {
			return CustomCode.getSelectedCustomMode() === "typewell";
		}

		// 保存されたカスタムコードでTypeWellモードの場合
		const codes = Storage.getSavedCodes();
		if (codes[DOM.langSel.value]) {
			return CustomCode.getCustomCodeMode(DOM.langSel.value) === "typewell";
		}

		// デフォルト言語でTypewellモードが選択されている場合
		if (DOM.langSel.value !== "custom" && DOM.langSel.value !== "typewell" && DOM.langSel.value !== "typewell-english-words" && DOM.langSel.value !== "initial-speed") {
			return Utils.getSelectedDefaultMode() === "typewell";
		}

		return false;
	},

	// 現在のモードがInitial Speedモードかどうかを判定
	isInitialSpeedMode() {
		return DOM.langSel.value === "initial-speed";
	},

	// ページの準備
	preparePages() {
		// Initial Speedモードでは従来のページングを使用しない
		if (this.isInitialSpeedMode()) {
			APP_STATE.allLines = [];
			APP_STATE.pages = [[{ line: "", idx: 0 }]]; // 空のページを1つだけ
			APP_STATE.currentPage = 0;
			this.updatePageSelect();
			return;
		}

		APP_STATE.allLines = Utils.getCurrentCode().split("\n");
		APP_STATE.pages = [];

		let currentPage = [];
		let nonEmptyLineCount = 0;
		let currentPageCharCount = 0;

		// ページを確定してリセットするヘルパー関数
		const finalizePage = () => {
			if (currentPage.length > 0) {
				APP_STATE.pages.push(currentPage);
			}
			currentPage = [];
			nonEmptyLineCount = 0;
			currentPageCharCount = 0;
		};

		APP_STATE.allLines.forEach((line, idx) => {
			// 現在の行の文字数（改行文字を含む）
			const lineCharCount = line.length + CONSTANTS.NEWLINE_CHAR_COUNT;

			// 20行制限チェック：非空白行が制限に達した場合、ページを確定
			if (
				nonEmptyLineCount >= CONSTANTS.LINES_PER_PAGE &&
				currentPage.length > 0
			) {
				finalizePage();
			}

			// 現在の行をページに追加
			currentPage.push({ line, idx });
			currentPageCharCount += lineCharCount;

			// 非空白行の場合はカウントを増やす
			if (line.trim() !== "") {
				nonEmptyLineCount++;
			}

			// 文字数制限チェック：800文字以上に達した場合、ページを確定
			if (currentPageCharCount >= CONSTANTS.CHARS_PER_PAGE) {
				finalizePage();
			}
		});

		// 最後のページを確定
		finalizePage();

		// ページが存在しない場合は空のページを作成
		if (APP_STATE.pages.length === 0) {
			APP_STATE.pages = [[{ line: "", idx: 0 }]];
		}

		APP_STATE.currentPage = 0;
		this.updatePageSelect();
	},

	// ページ選択の更新
	updatePageSelect() {
		DOM.pageSelectEl.innerHTML = "";
		for (let i = 0; i < APP_STATE.pages.length; i++) {
			const option = document.createElement("option");
			option.value = i;
			option.textContent = i + 1;
			DOM.pageSelectEl.appendChild(option);
		}
		DOM.pageSelectEl.value = APP_STATE.currentPage;
	},

	// ページのレンダリング
	renderPage() {
		// TypeWellモード（オリジナル・English Words）でカウントダウン中はコードを表示しない
		if (
			(DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") &&
			APP_STATE.typewellState === "countdown"
		) {
			return;
		}

		// ページが初期化されているかチェック
		if (
			!APP_STATE.pages ||
			APP_STATE.pages.length === 0 ||
			!APP_STATE.pages[APP_STATE.currentPage]
		) {
			console.warn("Pages not properly initialized, cannot render");
			return;
		}

		// Initial Speedモードの特別処理
		if (this.isInitialSpeedMode()) {
			document.body.classList.add("initial-speed-mode");
			this.hideAllScreens();
			this.showInitialSpeedStartScreen();
			return;
		} else {
			document.body.classList.remove("initial-speed-mode");
		}

		// TypeWellオリジナルモード・TypeWell English Wordsモードの特別処理
		if (DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") {
			document.body.classList.add("typewell-mode");
			document.body.classList.add("typewell-original-mode");
			// タイプウェルモードの場合は待機状態に設定
			APP_STATE.typewellState = "waiting";
			this.showTypeWellStartScreen();
			return;
		} else {
			document.body.classList.remove("typewell-mode");
			document.body.classList.remove("typewell-original-mode");
			this.hideTypeWellScreens();
		}

		// Word Practiceモードの特別処理
		if (DOM.langSel.value === "word-practice") {
			document.body.classList.add("word-practice-mode");
			// Word Practiceモードの場合は待機状態に設定
			APP_STATE.wordPracticeState = "waiting";
			UI.showWordPracticeStartScreen();
			return;
		} else {
			document.body.classList.remove("word-practice-mode");
			// Word Practice画面を非表示
			if (DOM.wordPracticeStartScreen) {
				DOM.wordPracticeStartScreen.style.display = "none";
			}
			if (DOM.wordPracticePracticeScreen) {
				DOM.wordPracticePracticeScreen.style.display = "none";
			}
		}

		// カスタムコードでTypeWellモードが選択されている場合
		if (this.isTypeWellMode()) {
			document.body.classList.add("typewell-mode");
			// カスタムコードの場合はオリジナルモードクラスは追加しない
		} else {
			document.body.classList.remove("typewell-mode");
		}

		this.renderNormalPage();
	},

	// すべての特別画面を非表示
	hideAllScreens() {
		this.hideTypeWellScreens();
		this.hideInitialSpeedScreens();
		// 通常のコード表示を戻す
		if (DOM.codeEl) {
			DOM.codeEl.style.display = "block";
		}
	},

	// Initial Speed画面の非表示
	hideInitialSpeedScreens() {
		if (DOM.initialSpeedStartScreen) {
			DOM.initialSpeedStartScreen.style.display = "none";
		}
		if (DOM.initialSpeedPracticeScreen) {
			DOM.initialSpeedPracticeScreen.style.display = "none";
		}
	},

	// Initial Speedスタート画面の表示
	showInitialSpeedStartScreen() {
		if (DOM.initialSpeedStartScreen) {
			DOM.initialSpeedStartScreen.style.display = "flex";
			this.updateInitialSpeedStartDisplay();
		}
		this.hideInitialSpeedPracticeScreen();
		// 通常のコード表示を隠す
		if (DOM.codeEl) {
			DOM.codeEl.style.display = "none";
		}
	},

	// Initial Speed練習画面の表示
	showInitialSpeedPracticeScreen() {
		if (DOM.initialSpeedPracticeScreen) {
			DOM.initialSpeedPracticeScreen.style.display = "flex";
		}
		this.hideInitialSpeedStartScreen();
		// 通常のコード表示を隠す
		if (DOM.codeEl) {
			DOM.codeEl.style.display = "none";
		}
	},

	// Initial Speed練習画面の非表示
	hideInitialSpeedPracticeScreen() {
		if (DOM.initialSpeedPracticeScreen) {
			DOM.initialSpeedPracticeScreen.style.display = "none";
		}
	},

	// Initial Speedスタート画面の非表示
	hideInitialSpeedStartScreen() {
		if (DOM.initialSpeedStartScreen) {
			DOM.initialSpeedStartScreen.style.display = "none";
		}
	},

	// Initial Speedスタート画面の表示更新
	updateInitialSpeedStartDisplay() {
		const mode = Utils.getSelectedInitialSpeedMode();
		const trials = Utils.getSelectedInitialSpeedTrials();
		const modeDisplayName = Utils.getInitialSpeedModeDisplayName(mode);

		if (DOM.initialSpeedTrialsDisplay) {
			DOM.initialSpeedTrialsDisplay.textContent = trials;
		}
		if (DOM.initialSpeedCurrentMode) {
			DOM.initialSpeedCurrentMode.textContent = modeDisplayName;
		}
	},

	// Initial Speed練習開始
	startInitialSpeedFromClick() {
		if (
			this.isInitialSpeedMode() &&
			APP_STATE.initialSpeedState === "waiting"
		) {
			this.startInitialSpeedPractice();
		}
	},

	// Initial Speed練習の開始
	startInitialSpeedPractice() {
		// 高品質ランダム生成器のシードをリセット（より自然な分散のため）
		Utils._seedXorshift128();

		// 設定を取得
		APP_STATE.initialSpeedMode = Utils.getSelectedInitialSpeedMode();
		APP_STATE.initialSpeedTotalTrials = Utils.getSelectedInitialSpeedTrials();
		APP_STATE.initialSpeedCurrentTrial = 0;
		APP_STATE.initialSpeedResults = [];
		APP_STATE.initialSpeedCurrentMistakes = [];
		APP_STATE.initialSpeedCurrentTrialMistakes = new Set(); // 現在の試行でミスした文字を追跡
		APP_STATE.initialSpeedConsecutiveMisses = 0; // 連続ミスカウンターをリセット

		// 初期状態設定
		APP_STATE.initialSpeedState = "starting";

		// 練習画面を表示
		this.showInitialSpeedPracticeScreen();

		// 開始処理
		this.startInitialSpeedTrial();
	},

	// Initial Speed単一試行の開始
	startInitialSpeedTrial() {
		APP_STATE.initialSpeedCurrentTrial++;
		APP_STATE.initialSpeedState = "starting";
		
		// 現在の試行のミス文字セットをリセット
		APP_STATE.initialSpeedCurrentTrialMistakes = new Set();

		// 文字を隠す
		if (DOM.initialSpeedCharacter) {
			DOM.initialSpeedCharacter.textContent = "";
			DOM.initialSpeedCharacter.className = "initial-speed-character";
		}

		// 進捗を隠す
		if (DOM.initialSpeedProgress) {
			DOM.initialSpeedProgress.textContent = "";
		}

		// ステータス表示（初回のみ）
		if (DOM.initialSpeedStatus) {
			if (APP_STATE.initialSpeedCurrentTrial === 1) {
				DOM.initialSpeedStatus.textContent = "Starting...";
				DOM.initialSpeedStatus.className = "initial-speed-status starting-message";
				DOM.initialSpeedStatus.style.color = ""; // 色をリセット
			}
			// 2回目以降はステータスをクリアしない（タイム表示を維持）
		}

		// 待機時間は常に1秒（ただし2回目以降はStarting...を表示しない）
		const waitTime = CONSTANTS.INITIAL_SPEED_SETTINGS.WAITING_TIME;

		// 待機後に文字表示
		APP_STATE.initialSpeedTimer = setTimeout(() => {
			this.showInitialSpeedCharacter();
		}, waitTime);
	},

	// Initial Speed文字表示と計測開始
	showInitialSpeedCharacter() {
		// ランダム文字生成
		APP_STATE.initialSpeedCurrentChar = Utils.generateInitialSpeedChar(
			APP_STATE.initialSpeedMode,
		);

		// 文字表示（大文字で表示、但し数字や記号はそのまま）
		if (DOM.initialSpeedCharacter) {
			const displayChar = /[a-z]/.test(APP_STATE.initialSpeedCurrentChar) 
				? APP_STATE.initialSpeedCurrentChar.toUpperCase() 
				: APP_STATE.initialSpeedCurrentChar;
			DOM.initialSpeedCharacter.textContent = displayChar;
			DOM.initialSpeedCharacter.className = "initial-speed-character";
		}

		// ステータス更新（新しい文字表示時にタイム表示をクリア）
		if (DOM.initialSpeedStatus) {
			DOM.initialSpeedStatus.textContent = "";
			DOM.initialSpeedStatus.style.color = ""; // 色をリセット
		}

		// 計測開始（0.1秒の入力ガード期間付き）
		APP_STATE.initialSpeedStartTime = Date.now();
		APP_STATE.initialSpeedState = "guarded"; // ガード状態

		// 0.1秒後に入力受付開始（事前入力防止）
		setTimeout(() => {
			if (APP_STATE.initialSpeedState === "guarded") {
				APP_STATE.initialSpeedState = "ready";
			}
		}, 100);
	},

	// Initial Speed入力処理
	handleInitialSpeedInput(key) {
		// ガード期間中は入力を無視（事前入力防止）
		if (APP_STATE.initialSpeedState === "guarded") {
			return;
		}
		
		if (APP_STATE.initialSpeedState !== "ready") {
			return;
		}

		const inputChar = key;
		const expectedChar = APP_STATE.initialSpeedCurrentChar;
		const reactionTime = Date.now() - APP_STATE.initialSpeedStartTime;

		// 原始的反射モードの判定
		const currentMode = APP_STATE.initialSpeedMode;
		let isMatch = false;

		if (currentMode === CONSTANTS.INITIAL_SPEED_SETTINGS.MODES.HAND_PRIMITIVE) {
			// 原始的反射モード: 同じ手のセット内なら正解
			const leftHandSet = CONSTANTS.INITIAL_SPEED_SETTINGS.CHARACTER_SETS.lefthand;
			const rightHandSet = CONSTANTS.INITIAL_SPEED_SETTINGS.CHARACTER_SETS.righthand;
			
			const expectedInLeftHand = leftHandSet.includes(expectedChar.toLowerCase());
			const inputInLeftHand = leftHandSet.includes(inputChar.toLowerCase());
			const expectedInRightHand = rightHandSet.includes(expectedChar.toLowerCase());
			const inputInRightHand = rightHandSet.includes(inputChar.toLowerCase());
			
			isMatch = (expectedInLeftHand && inputInLeftHand) || (expectedInRightHand && inputInRightHand);
		} else {
			// 通常モード: 大文字小文字を区別しない照合（英字の場合のみ）
			isMatch = /[a-zA-Z]/.test(expectedChar) 
				? inputChar.toLowerCase() === expectedChar.toLowerCase()
				: inputChar === expectedChar;
		}

		if (isMatch) {
			// 正解 - 連続ミスカウンターをリセット
			APP_STATE.initialSpeedConsecutiveMisses = 0;
			this.recordInitialSpeedResult(
				true,
				reactionTime,
				inputChar,
				expectedChar,
			);
			this.proceedToNextTrial(reactionTime);
		} else {
			// 不正解 - 連続ミスカウンターを増加
			APP_STATE.initialSpeedConsecutiveMisses++;
			
			// 不正解 - 赤色表示、その場停止
			if (DOM.initialSpeedCharacter) {
				DOM.initialSpeedCharacter.className =
					"initial-speed-character incorrect";
			}

			// ミス記録（時間も記録）
			this.recordInitialSpeedResult(
				false,
				reactionTime,
				inputChar,
				expectedChar,
			);

			// 連続3回ミスでゲーム終了
			if (APP_STATE.initialSpeedConsecutiveMisses >= 3) {
				this.endInitialSpeedPracticeEarly();
				return;
			}
			
			// ミスタイプ時はその場で停止、正しい文字の入力を待つ
		}
	},


	// Initial Speed練習の早期終了（連続3回ミス）
	endInitialSpeedPracticeEarly() {
		APP_STATE.initialSpeedState = "terminated";

		// ステータス表示（英語、オレンジ色で威圧感を軽減）
		if (DOM.initialSpeedStatus) {
			DOM.initialSpeedStatus.textContent = "Practice terminated - 3 consecutive misses";
			DOM.initialSpeedStatus.style.color = "#ff8c00"; // オレンジ色
		}

		// 文字を隠す
		if (DOM.initialSpeedCharacter) {
			DOM.initialSpeedCharacter.textContent = "";
			DOM.initialSpeedCharacter.className = "initial-speed-character";
		}

		// 1.5秒後にスタート画面に戻る（リザルトなし）
		setTimeout(() => {
			this.resetInitialSpeedToStart();
		}, 1500);
	},

	// Initial Speedをスタート画面にリセット（記録なし）
	resetInitialSpeedToStart() {
		// 状態をリセット
		APP_STATE.initialSpeedState = "waiting";
		APP_STATE.initialSpeedCurrentTrial = 0;
		APP_STATE.initialSpeedResults = [];
		APP_STATE.initialSpeedCurrentMistakes = [];
		APP_STATE.initialSpeedCurrentTrialMistakes = new Set();
		APP_STATE.initialSpeedConsecutiveMisses = 0;

		// ステータスと文字をクリア
		if (DOM.initialSpeedStatus) {
			DOM.initialSpeedStatus.textContent = "";
			DOM.initialSpeedStatus.style.color = ""; // 色をリセット
		}
		if (DOM.initialSpeedCharacter) {
			DOM.initialSpeedCharacter.textContent = "";
			DOM.initialSpeedCharacter.className = "initial-speed-character";
		}

		// 正常な初期化処理を呼び出して適切にスタート画面を表示
		this.renderPage();
	},

	// Initial Speed結果記録
	recordInitialSpeedResult(correct, time, inputChar, expectedChar) {
		const result = {
			trial: APP_STATE.initialSpeedCurrentTrial,
			char: expectedChar,
			time: time,
			correct: correct,
			inputChar: inputChar,
		};

		APP_STATE.initialSpeedResults.push(result);

		// ミスの場合はミス記録にも追加
		if (!correct) {
			this.recordInitialSpeedMistake(expectedChar);
		}
	},

	// Initial Speedミス記録（1試行につき1文字1回まで）
	recordInitialSpeedMistake(expectedChar) {
		// 現在の試行で既に記録済みの文字はスキップ
		if (APP_STATE.initialSpeedCurrentTrialMistakes.has(expectedChar)) {
			return;
		}
		
		// 現在の試行でのミス文字として記録
		APP_STATE.initialSpeedCurrentTrialMistakes.add(expectedChar);
		APP_STATE.initialSpeedCurrentMistakes.push({ expectedChar });

		// Initial Speed専用のミス統計に記録
		const languageName = this.getInitialSpeedLanguageName();
		Storage.recordInitialSpeedMistake(languageName, expectedChar);
	},

	// Initial Speed言語名取得
	getInitialSpeedLanguageName() {
		const mode = APP_STATE.initialSpeedMode;
		return `Initial Speed (${Utils.getInitialSpeedModeDisplayName(mode)})`;
	},

	// Initial Speed次の試行への進行（進捗表示なし）
	proceedToNextTrial(reactionTime = null) {
		APP_STATE.initialSpeedState = "between";

		// 文字を隠す
		if (DOM.initialSpeedCharacter) {
			DOM.initialSpeedCharacter.textContent = "";
			DOM.initialSpeedCharacter.className = "initial-speed-character";
		}

		// 進捗表示は削除（不要）
		if (DOM.initialSpeedProgress) {
			DOM.initialSpeedProgress.textContent = "";
		}

		// 正解した場合はタイム表示（文字が隠れた状態で）
		if (reactionTime !== null && DOM.initialSpeedStatus) {
			DOM.initialSpeedStatus.textContent = Utils.formatReactionTime(reactionTime);
			DOM.initialSpeedStatus.className = "initial-speed-status reaction-time";
			DOM.initialSpeedStatus.style.color = ""; // CSSクラスの色を使用
		} else {
			// ステータスを隠す（ミスの場合など）
			if (DOM.initialSpeedStatus) {
				DOM.initialSpeedStatus.textContent = "";
				DOM.initialSpeedStatus.className = "initial-speed-status";
				DOM.initialSpeedStatus.style.color = ""; // 色をリセット
			}
		}

		// 次の試行または完了処理（待機時間なしで即座に実行）
		if (
			APP_STATE.initialSpeedCurrentTrial < APP_STATE.initialSpeedTotalTrials
		) {
			// 次の試行へ（即座に）
			this.startInitialSpeedTrial();
		} else {
			// 完了（即座に）
			this.completeInitialSpeedPractice();
		}
	},

	// Initial Speed練習完了
	completeInitialSpeedPractice() {
		APP_STATE.initialSpeedState = "completed";

		// ステータスと文字を隠す
		if (DOM.initialSpeedStatus) {
			DOM.initialSpeedStatus.textContent = "";
		}
		if (DOM.initialSpeedCharacter) {
			DOM.initialSpeedCharacter.textContent = "";
		}

		// 統計計算
		const stats = Utils.calculateInitialSpeedStats(
			APP_STATE.initialSpeedResults,
		);

		// 言語名の取得
		const languageName = this.getInitialSpeedLanguageName();
		const trials = APP_STATE.initialSpeedTotalTrials;

		// 統計保存（平均反応時間を秒単位で保存）
		Stats.saveResult(
			languageName,
			1, // partNumber
			1, // totalParts
			0, // WPMは不要（0で保存）
			stats.accuracy,
			stats.averageTime / 1000, // 平均反応時間を秒に変換
			trials, // 文字数として試行回数を使用
		);

		// リザルト画面表示
		this.showInitialSpeedResults(stats);
	},

	// Initial Speedリザルト表示
	showInitialSpeedResults(stats) {
		// 詳細結果の生成
		this.generateInitialSpeedDetailedResults();

		// 全記録中の順位を計算
		const languageName = this.getInitialSpeedLanguageName();
		const currentAverageTime = stats.averageTime / 1000; // 秒に変換
		const rankInfo = Stats.calculateRankByTime(languageName, 1, currentAverageTime);

		// 現在のセッションのミス統計
		const sessionMistakes = this.getInitialSpeedSessionMistakes(3);

		// リザルト表示の更新
		this.updateInitialSpeedResultsDisplay(
			stats,
			rankInfo,
			sessionMistakes,
		);

		// オーバーレイ表示
		this.hideAllScreens();
		UI.showOverlay(
			APP_STATE.initialSpeedTotalTrials,
			APP_STATE.initialSpeedTotalTrials,
		);
	},

	// Initial Speed詳細結果生成
	generateInitialSpeedDetailedResults() {
		if (!DOM.initialSpeedDetailedResults) return;

		const results = APP_STATE.initialSpeedResults;
		const bestTime = Math.min(
			...results.filter((r) => r.correct).map((r) => r.time),
		);
		const worstTime = Math.max(
			...results.filter((r) => r.correct).map((r) => r.time),
		);

		let html = '<div class="initial-speed-trials-list">';

		results.forEach((result) => {
			const isBest = result.correct && result.time === bestTime;
			const isWorst = result.correct && result.time === worstTime;
			const missInfo = result.correct
				? ""
				: ` (Miss: pressed '${result.inputChar}')`;
			const badge = isBest ? " ✓ (Best)" : isWorst ? " (Worst)" : "";

			html += `
				<div class="trial-result ${result.correct ? "correct" : "incorrect"}">
					<span class="trial-number">Trial ${result.trial}:</span>
					<span class="trial-char">${result.char}</span>
					<span class="trial-arrow">→</span>
					<span class="trial-time">${Utils.formatReactionTime(result.time)}${badge}</span>
					<span class="trial-miss">${missInfo}</span>
				</div>
			`;
		});

		html += "</div>";
		DOM.initialSpeedDetailedResults.innerHTML = html;
	},

	// Initial Speedリザルト表示更新
	updateInitialSpeedResultsDisplay(
		stats,
		rankInfo,
		sessionMistakes,
	) {
		// Initial Speed専用リザルトセクションを表示
		if (DOM.initialSpeedResults) {
			DOM.initialSpeedResults.style.display = "block";
		}

		// 通常の統計セクションを非表示
		const statsListEl = document.querySelector(".stats-list");
		if (statsListEl) {
			statsListEl.style.display = "none";
		}

		// モード情報
		if (DOM.initialSpeedModeInfo) {
			DOM.initialSpeedModeInfo.textContent =
				Utils.getInitialSpeedModeDisplayName(APP_STATE.initialSpeedMode);
		}
		if (DOM.initialSpeedTrialsInfo) {
			DOM.initialSpeedTrialsInfo.textContent = `${APP_STATE.initialSpeedTotalTrials} trials`;
		}

		// サマリー統計
		if (DOM.initialSpeedSummary) {
			const rankText = `#${rankInfo.rank}`;
			
			DOM.initialSpeedSummary.innerHTML = `
				<div class="initial-speed-summary-grid">
					<div class="summary-stat">
						<span class="summary-label">Average:</span>
						<span class="summary-value">${Utils.formatReactionTime(stats.averageTime)}</span>
					</div>
					<div class="summary-stat">
						<span class="summary-label">Best Time:</span>
						<span class="summary-value">${Utils.formatReactionTime(stats.bestTime)}</span>
					</div>
					<div class="summary-stat">
						<span class="summary-label">Worst Time:</span>
						<span class="summary-value">${Utils.formatReactionTime(stats.worstTime)}</span>
					</div>
					<div class="summary-stat">
						<span class="summary-label">Accuracy:</span>
						<span class="summary-value">${stats.accuracy}%</span>
					</div>
					<div class="summary-stat">
						<span class="summary-label">Total Mistakes:</span>
						<span class="summary-value">${stats.totalMistakes}</span>
					</div>
					<div class="summary-stat">
						<span class="summary-label">Rank:</span>
						<span class="summary-value">${rankText}</span>
					</div>
				</div>
			`;
		}

		// ページバッジ
		const pageBadgeEl = document.getElementById("page-badge");
		if (pageBadgeEl) {
			pageBadgeEl.textContent = `Initial Speed`;
		}

		// 文字数表示
		const characterCountEl = document.getElementById("character-count");
		if (characterCountEl) {
			characterCountEl.textContent = `${APP_STATE.initialSpeedTotalTrials} trials`;
		}

		// 従来のランキング表示を無効化（Initial Speedは独自表示を使用）

		// ミス文字表示
		this.updateInitialSpeedMistakes(sessionMistakes);
	},

	// Initial SpeedのTOP3ランキング更新
	updateInitialSpeedRanking(top3Records, rankStatus, stats) {
		const top3RankingEl = document.getElementById("top3-ranking");

		// Initial SpeedモードではRanked表示を常に非表示にする
		if (top3RankingEl) {
			top3RankingEl.style.display = "none";
		}
	},

	// Initial Speedミス文字表示更新
	updateInitialSpeedMistakes(sessionMistakes) {
		const mistakeCharsEl = document.getElementById("mistake-chars");

		if (mistakeCharsEl && sessionMistakes.length > 0) {
			mistakeCharsEl.style.display = "block";
			const mistakeListEl = document.getElementById("mistake-list");

			if (mistakeListEl) {
				mistakeListEl.innerHTML = sessionMistakes
					.map(
						({ mistake, count }) =>
							`<span class="mistake-char">${mistake} (${count})</span>`,
					)
					.join("");
			}
		} else if (mistakeCharsEl) {
			mistakeCharsEl.style.display = "none";
		}
	},

	// Initial Speedセッションミス統計取得
	getInitialSpeedSessionMistakes(limit = 3) {
		if (
			!APP_STATE.initialSpeedCurrentMistakes ||
			APP_STATE.initialSpeedCurrentMistakes.length === 0
		) {
			return [];
		}

		// ミスの集計（本来打つべき文字のみ）
		const mistakeCount = {};
		APP_STATE.initialSpeedCurrentMistakes.forEach(
			({ expectedChar }) => {
				// 特殊文字の表示名変換
				let displayChar = expectedChar;
				if (expectedChar === " ") displayChar = "Space";
				else if (expectedChar === "\n") displayChar = "Enter";
				else if (expectedChar === "\t") displayChar = "Tab";
				
				mistakeCount[displayChar] = (mistakeCount[displayChar] || 0) + 1;
			},
		);

		// カウント順にソートして上位を返す
		return Object.entries(mistakeCount)
			.sort(([, a], [, b]) => b - a)
			.slice(0, limit)
			.map(([mistake, count]) => ({ mistake, count }));
	},

	// TypeWell詳細結果生成
	generateTypeWellDetailedResults() {
		if (!DOM.typewellDetailedResults) return;

		const lineTimes = APP_STATE.typewellLineTimes;
		if (!lineTimes || lineTimes.length === 0) return;

		const fastestTime = Math.min(...lineTimes.map((l) => l.time));
		const slowestTime = Math.max(...lineTimes.map((l) => l.time));

		let html = '<div class="typewell-lines-list">';

		lineTimes.forEach((lineData) => {
			const isFastest = lineData.time === fastestTime;
			const isSlowest = lineData.time === slowestTime;
			const badge = isFastest ? " ✓ (Fastest)" : isSlowest ? " (Slowest)" : "";

			html += `
				<div class="line-result">
					<span class="line-number">Line ${lineData.line}:</span>
					<span class="line-time">${lineData.time.toFixed(3)}s${badge}</span>
					<span></span>
				</div>
			`;
		});

		html += "</div>";
		DOM.typewellDetailedResults.innerHTML = html;
	},

	// タイプウェルスタート画面の表示
	showTypeWellStartScreen() {
		if (DOM.langSel.value === "typewell") {
			// TypeWell オリジナルモード
			if (DOM.typewellStartScreen) {
				DOM.typewellStartScreen.style.display = "flex";
				this.updateTypeWellModeDisplay();
			}
		} else if (DOM.langSel.value === "typewell-english-words") {
			// TypeWell English Words モード
			if (DOM.typewellEnglishWordsStartScreen) {
				DOM.typewellEnglishWordsStartScreen.style.display = "flex";
				UI.updateTypeWellEnglishWordsStartDisplay();
			}
		}
		
		if (DOM.typewellCountdown) {
			DOM.typewellCountdown.style.display = "none";
		}
		// 通常のコード表示を隠す
		if (DOM.codeEl) {
			DOM.codeEl.style.display = "none";
		}
	},

	// タイプウェルカウントダウンの表示
	showTypeWellCountdown() {
		if (DOM.typewellStartScreen) {
			DOM.typewellStartScreen.style.display = "none";
		}
		if (DOM.typewellEnglishWordsStartScreen) {
			DOM.typewellEnglishWordsStartScreen.style.display = "none";
		}
		if (DOM.typewellCountdown) {
			DOM.typewellCountdown.style.display = "flex";
		}
		// 通常のコード表示を隠す
		if (DOM.codeEl) {
			DOM.codeEl.style.display = "none";
		}
	},

	// タイプウェル画面の非表示
	hideTypeWellScreens() {
		if (DOM.typewellStartScreen) {
			DOM.typewellStartScreen.style.display = "none";
		}
		if (DOM.typewellEnglishWordsStartScreen) {
			DOM.typewellEnglishWordsStartScreen.style.display = "none";
		}
		if (DOM.typewellCountdown) {
			DOM.typewellCountdown.style.display = "none";
		}
		// 通常のコード表示を戻す
		if (DOM.codeEl) {
			DOM.codeEl.style.display = "block";
		}
	},

	// タイプウェルモード表示の更新
	updateTypeWellModeDisplay() {
		const modeDisplayEl = document.getElementById("typewell-current-mode");
		if (modeDisplayEl) {
			const mode = Utils.getSelectedTypeWellMode();
			switch (mode) {
				case "lowercase":
					modeDisplayEl.textContent = "Lowercase (a-z)";
					break;
				case "mixed":
					modeDisplayEl.textContent = "Mixed Case (a-z, A-Z)";
					break;
				case "symbols":
					modeDisplayEl.textContent = "With Symbols (a-z, A-Z, symbols)";
					break;
				case "numbers":
					modeDisplayEl.textContent = "Numbers Only (0-9)";
					break;
				default:
					modeDisplayEl.textContent = "Lowercase (a-z)";
			}
		}
	},

	// タイプウェルカウントダウンの開始
	startTypeWellCountdown() {
		APP_STATE.typewellState = "countdown";

		// ストレージからカウントダウン秒数を取得
		const countdownSeconds = Storage.getTypewellCountdown();

		// 0秒の場合は即座にタイピング開始
		if (countdownSeconds === 0) {
			this.startTypeWellTyping();
			return;
		}

		APP_STATE.countdownValue = countdownSeconds;
		this.showTypeWellCountdown();

		const countdownEl = document.querySelector(".typewell-countdown-number");

		const updateCountdown = () => {
			if (countdownEl) {
				countdownEl.textContent = APP_STATE.countdownValue;
			}

			APP_STATE.countdownValue--;

			if (APP_STATE.countdownValue < 0) {
				clearInterval(APP_STATE.countdownTimer);
				APP_STATE.countdownTimer = null;

				// タイマーを即時開始
				this.startTimer();

				// タイピング状態をアクティブに設定
				APP_STATE.isActive = true;

				// タイピング開始処理
				this.startTypeWellTyping();
			}
		};

		// 最初の表示
		updateCountdown();

		// 1秒間隔でカウントダウン
		APP_STATE.countdownTimer = setInterval(updateCountdown, 1000);
	},

	// タイプウェルタイピング開始
	startTypeWellTyping() {
		APP_STATE.typewellState = "typing";
		this.hideTypeWellScreens();

		// ライン記録の初期化
		APP_STATE.typewellLineTimes = [];
		APP_STATE.typewellCurrentLine = 0;

		// タイピング開始前にページをレンダリング
		this.renderNormalPage();

		// 入力フィールドにフォーカスを設定
		if (DOM.inputEl) {
			DOM.inputEl.focus();
		}
	},

	// タイプウェル開始ボタンのクリックハンドラー
	startTypeWellFromClick() {
		if (
			(DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") &&
			APP_STATE.typewellState === "waiting"
		) {
			this.startTypeWellCountdown();
		}
	},

	// 通常ページのレンダリング
	renderNormalPage() {
		DOM.codeEl.innerHTML = "";
		const page = APP_STATE.pages[APP_STATE.currentPage].slice(
			0,
			CONSTANTS.MAX_DISPLAY_LINES,
		);

		page.forEach(({ line, idx }) => {
			const row = document.createElement("div");
			row.className = "line";

			// テキストラップが有効な場合はクラスを追加
			if (APP_STATE.isTextWrapEnabled) {
				row.classList.add("text-wrap");
			}

			// 行番号
			const num = document.createElement("span");
			num.className = "lineno";
			num.textContent = idx + 1;
			row.appendChild(num);

			// テキストラップ時は文字コンテンツを別コンテナに
			let charContainer = row;
			if (APP_STATE.isTextWrapEnabled) {
				charContainer = document.createElement("div");
				charContainer.className = "char-content";
				row.appendChild(charContainer);
			}

			// インデント処理
			const lead = line.match(/^\s*/)[0].length;
			for (let j = 0; j < lead; j++) {
				const span = document.createElement("span");

				// TypeWellモードでは行頭空白もタイピング対象とする
				if (this.isTypeWellMode()) {
					span.className = "char pending";
					span.dataset.char = " ";
				} else {
					span.className = "char indent";
					span.dataset.char = " ";
				}

				span.textContent = " ";
				charContainer.appendChild(span);
			}

			// 文字の追加
			for (let j = lead; j < line.length; j++) {
				const char = line[j];
				const span = document.createElement("span");

				// 2バイト文字の場合はスキップ対象として特別処理
				if (this.isMultiByteChar(char)) {
					span.className = "char multibyte-skip";
					// data-char属性を付けない = タイピング対象外
				} else {
					span.className = "char pending";
					span.dataset.char = char;
				}

				// TypeWellオリジナルの小文字モードの場合、表示を大文字に変換
				let displayChar = char;
				if (DOM.langSel.value === "typewell" && Utils.getSelectedTypeWellMode() === "lowercase") {
					// 小文字のアルファベットのみ大文字に変換（空白やカンマ、ピリオドはそのまま）
					if (/^[a-z]$/.test(char)) {
						displayChar = char.toUpperCase();
					}
				}

				span.textContent = displayChar;
				charContainer.appendChild(span);
			}

			// 改行マーカーの処理
			if (line.trim() !== "" || idx === APP_STATE.allLines.length - 1) {
				const nl = document.createElement("span");

				// TypeWellオリジナルモード・TypeWell English Wordsモードでは改行も自動スキップ
				// カスタムコードのTypeWellモードでは改行をタイピング対象にする
				if (DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") {
					nl.className = "char multibyte-skip newline";
					// data-char属性を付けない = タイピング対象外
				} else {
					nl.className = "char pending newline";
					nl.dataset.char = "\n";
				}

				nl.textContent = "⏎";
				charContainer.appendChild(nl);
			}

			DOM.codeEl.appendChild(row);
		});

		// DOM要素をキャッシュ（パフォーマンス最適化）
		this.cacheTargets();

		APP_STATE.inputBuffer = "";
		this.highlightCurrent();

		// 進捗表示の初期化
		DOM.progressTextEl.textContent = `0/${this.cachedTargets.length}`;
	},

	// DOM要素をキャッシュしてパフォーマンス向上
	cacheTargets() {
		const spans = [...DOM.codeEl.querySelectorAll(".char")];

		if (this.isTypeWellMode()) {
			// TypeWellモードでは行頭空白もタイピング対象とする
			this.cachedTargets = spans.filter(
				(s) => !s.classList.contains("multibyte-skip"),
			);
		} else {
			// 通常モードでは従来通りインデントを除外
			this.cachedTargets = spans.filter(
				(s) =>
					!s.classList.contains("indent") &&
					!s.classList.contains("multibyte-skip"),
			);
		}

		this.currentHighlightIndex = -1;
	},

	// 状態のリセット
	resetState() {
		clearInterval(APP_STATE.timerInterval);
		clearInterval(APP_STATE.countdownTimer);
		clearTimeout(APP_STATE.initialSpeedTimer);

		APP_STATE.startTime = null;
		APP_STATE.countdownTimer = null;
		APP_STATE.countdownValue = 0;
		APP_STATE.initialSpeedTimer = null;

		DOM.timerEl.textContent = "0s";
		DOM.wpmEl.textContent = "WPM: 0";
		DOM.accEl.textContent = "Accuracy: 100%";
		DOM.progressEl.style.width = "0";
		DOM.progressTextEl.textContent = "0/0";
		APP_STATE.inputBuffer = "";
		APP_STATE.totalKeystrokes = 0;
		APP_STATE.errorCount = 0;
		APP_STATE.correctCharacters = 0;
		APP_STATE.maxCorrectPosition = 0;
		APP_STATE.currentMistakes = [];
		APP_STATE.currentLineCharCount = 0; // 休憩機能：行文字数リセット
		APP_STATE.isBreakActive = false; // 休憩機能：休憩状態リセット

		// タイプウェル状態のリセット
		if (DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") {
			APP_STATE.typewellState = "waiting";
			APP_STATE.typewellLineTimes = [];
			APP_STATE.typewellCurrentLine = 0;
		}

		// Initial Speed状態のリセット
		if (this.isInitialSpeedMode()) {
			APP_STATE.initialSpeedState = "waiting";
			APP_STATE.initialSpeedCurrentTrial = 0;
			APP_STATE.initialSpeedResults = [];
			APP_STATE.initialSpeedCurrentMistakes = [];
			APP_STATE.initialSpeedCurrentTrialMistakes = new Set();
		}

		// Word Practice状態のリセット
		if (DOM.langSel.value === "word-practice") {
			APP_STATE.wordPracticeState = "waiting";
			APP_STATE.wordPracticeCurrentWord = 0;
			APP_STATE.wordPracticeWords = [];
			APP_STATE.wordPracticeResults = [];
			APP_STATE.wordPracticeStats = null;
			APP_STATE.wordPracticeWordStartTime = null;
			APP_STATE.wordPracticeFirstKeyTime = null;
			APP_STATE.wordPracticeFirstKeyPressed = false;
		}

		this.currentHighlightIndex = -1;
	},

	// タイマーの開始
	startTimer() {
		APP_STATE.startTime = Date.now();
		APP_STATE.timerInterval = setInterval(() => {
			const secs = Math.floor((Date.now() - APP_STATE.startTime) / 1000);
			DOM.timerEl.textContent = `${secs}s`;
			this.updateStats();
		}, 1000);
	},

	// 効率的な現在位置のハイライト
	highlightCurrent() {
		const newIndex = APP_STATE.inputBuffer.length;

		// 前回と同じ位置なら何もしない
		if (this.currentHighlightIndex === newIndex) return;

		// 前回のハイライトを削除
		if (
			this.currentHighlightIndex >= 0 &&
			this.cachedTargets[this.currentHighlightIndex]
		) {
			this.cachedTargets[this.currentHighlightIndex].classList.remove(
				"current",
			);
		}

		// 新しい位置をハイライト
		if (newIndex < this.cachedTargets.length && this.cachedTargets[newIndex]) {
			this.cachedTargets[newIndex].classList.add("current");
		}

		this.currentHighlightIndex = newIndex;
	},

	// 効率的な表示更新
	updateDisplay() {
		if (this.updatePending) return;

		this.updatePending = true;
		requestAnimationFrame(() => {
			this.performUpdate();
			this.updatePending = false;
		});
	},

	// 実際の更新処理
	performUpdate() {
		let correctCount = 0;
		let currentCorrectPosition = 0;

		// 変更が必要な範囲のみ更新
		const inputLength = APP_STATE.inputBuffer.length;
		const targets = this.cachedTargets;

		for (
			let i = 0;
			i < Math.max(inputLength + 1, this.lastUpdateLength || 0);
			i++
		) {
			const span = targets[i];
			if (!span) break;

			if (i < inputLength) {
				const expectedChar = span.dataset.char;
				const typedChar = APP_STATE.inputBuffer[i];

				// TypeWell英単語モードおよび小文字モードでは大文字・小文字を区別しない判定
				let isMatch = false;
				if (DOM.langSel.value === "typewell-english-words") {
					if (/^[a-zA-Z]$/.test(expectedChar)) {
						isMatch = typedChar.toLowerCase() === expectedChar.toLowerCase();
					} else {
						isMatch = typedChar === expectedChar;
					}
				} else if (DOM.langSel.value === "typewell" && Utils.getSelectedTypeWellMode() === "lowercase") {
					if (/^[a-z]$/.test(expectedChar)) {
						isMatch = typedChar.toLowerCase() === expectedChar;
					} else {
						isMatch = typedChar === expectedChar;
					}
				} else {
					isMatch = typedChar === expectedChar;
				}

				if (isMatch) {
					span.className = `char correct${span.classList.contains("newline") ? " newline" : ""}`;
					correctCount++;
					if (currentCorrectPosition === i) {
						currentCorrectPosition = i + 1;
					}
				} else {
					span.className = `char incorrect${span.classList.contains("newline") ? " newline" : ""}`;

					// 空白や改行の誤入力を視覚化
					if (expectedChar === " " || expectedChar === "\n") {
						if (typedChar === " ") {
							span.textContent = "␣";
						} else if (typedChar === "\n") {
							span.textContent = "↵";
						} else if (typedChar === "\t") {
							span.textContent = "→";
						} else {
							span.textContent = typedChar;
						}
					}
				}
			} else if (i === inputLength || i < (this.lastUpdateLength || 0)) {
				span.className = `char pending${span.classList.contains("newline") ? " newline" : ""}`;
				// 元のテキストに戻す
				if (span.dataset.char === "\n") {
					span.textContent = "⏎";
				} else {
					// TypeWell小文字モードでは大文字表示を維持
					if (DOM.langSel.value === "typewell" && Utils.getSelectedTypeWellMode() === "lowercase" && /^[a-z]$/.test(span.dataset.char)) {
						span.textContent = span.dataset.char.toUpperCase();
					} else {
						span.textContent = span.dataset.char;
					}
				}
			}
		}

		this.lastUpdateLength = inputLength;

		// WPMカウント用の正しい文字数を更新
		if (currentCorrectPosition > APP_STATE.maxCorrectPosition) {
			const newCharacters =
				currentCorrectPosition - APP_STATE.maxCorrectPosition;
			APP_STATE.correctCharacters += newCharacters;
			APP_STATE.maxCorrectPosition = currentCorrectPosition;
		}

		this.highlightCurrent();
		this.updateStats(correctCount, targets.length);

		// TypeWellモードで行完了チェック
		if ((DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") && APP_STATE.startTime) {
			this.checkTypeWellLineCompletion();
		}

		// 完了チェック
		if (inputLength >= targets.length && correctCount === targets.length) {
			UI.showOverlay(correctCount, targets.length);
		}
	},

	// 統計の更新
	updateStats(correctCount = null, total = null) {
		if (!APP_STATE.startTime) return;

		if (correctCount === null || total === null) {
			const targets = this.cachedTargets;
			total = targets.length;

			correctCount = 0;
			for (
				let i = 0;
				i < Math.min(APP_STATE.inputBuffer.length, targets.length);
				i++
			) {
				if (APP_STATE.inputBuffer[i] === targets[i]?.dataset.char) {
					correctCount++;
				} else {
					break;
				}
			}
		}

		const elapsed = (Date.now() - APP_STATE.startTime) / 60000 || 1 / 60;

		// WPMは分間文字数として計算（正しく入力された文字数のみ）
		const wpm = Math.round(APP_STATE.correctCharacters / elapsed);
		DOM.wpmEl.textContent = `WPM: ${wpm}`;

		// 正確性の計算
		const accuracy =
			APP_STATE.totalKeystrokes > 0
				? Math.round(
						((APP_STATE.totalKeystrokes - APP_STATE.errorCount) /
							APP_STATE.totalKeystrokes) *
							100,
					)
				: 100;
		DOM.accEl.textContent = `Accuracy: ${accuracy}%`;

		// 進捗表示
		DOM.progressTextEl.textContent = `${correctCount}/${total}`;
		DOM.progressEl.style.width = `${(correctCount / total) * 100}%`;
	},

	// 休憩判定と休憩ダイアログ表示
	checkAndShowBreak() {
		const breakChars = Storage.getBreakChars();

		// 休憩設定が0以下の場合は無効
		if (breakChars <= 0) {
			return false;
		}

		// 現在の行文字数が設定値以上なら休憩を表示
		if (APP_STATE.currentLineCharCount >= breakChars) {
			this.showBreakDialog();
			return true;
		}

		return false;
	},

	// 休憩ダイアログの表示
	showBreakDialog() {
		APP_STATE.isBreakActive = true;

		// タイマーを一時停止
		if (APP_STATE.timerInterval) {
			clearInterval(APP_STATE.timerInterval);
			APP_STATE.timerInterval = null;
		}

		// 現在の統計情報を取得して表示
		this.updateBreakStats();

		// 休憩ダイアログを表示
		if (DOM.breakDialog) {
			DOM.breakDialog.style.display = "flex";
		}
	},

	// 休憩ダイアログの統計情報更新
	updateBreakStats() {
		if (!APP_STATE.startTime) return;

		// 現在のWPMを取得
		const elapsed = (Date.now() - APP_STATE.startTime) / 60000 || 1 / 60;
		const wpm = Math.round(APP_STATE.correctCharacters / elapsed);

		// 現在の経過時間を取得
		const seconds = Math.floor((Date.now() - APP_STATE.startTime) / 1000);

		// 現在の正確な文字数を取得
		const characters = APP_STATE.correctCharacters;

		// DOM要素に表示
		const breakWpmEl = document.getElementById("break-wpm");
		const breakTimeEl = document.getElementById("break-time");
		const breakCharsEl = document.getElementById("break-chars");

		if (breakWpmEl) breakWpmEl.textContent = wpm;
		if (breakTimeEl) breakTimeEl.textContent = `${seconds}s`;
		if (breakCharsEl) breakCharsEl.textContent = characters;
	},

	// 休憩ダイアログの非表示と再開
	hideBreakDialog() {
		APP_STATE.isBreakActive = false;
		APP_STATE.currentLineCharCount = 0; // 行文字数をリセット

		// 休憩ダイアログを非表示
		if (DOM.breakDialog) {
			DOM.breakDialog.style.display = "none";
		}

		// タイマーを再開
		if (APP_STATE.startTime && !APP_STATE.timerInterval) {
			APP_STATE.timerInterval = setInterval(() => {
				const secs = Math.floor((Date.now() - APP_STATE.startTime) / 1000);
				DOM.timerEl.textContent = `${secs}s`;
				this.updateStats();
			}, 1000);
		}
	},

	// ページ移動
	goToPage(pageIndex) {
		if (pageIndex >= 0 && pageIndex < APP_STATE.pages.length) {
			APP_STATE.currentPage = pageIndex;
			this.resetState();
			this.renderPage();
			this.updatePageSelect();
		}
	},

	// 次のページへ
	nextPage() {
		if (DOM.overlay.style.visibility === "visible") {
			UI.hideOverlay(() => {
				if (this.isInitialSpeedMode()) {
					// Initial Speedモードでは新しい練習を開始
					this.preparePages();
					this.resetState();
					this.renderPage();
				} else if (DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") {
					// TypeWellオリジナルモード・TypeWell English Wordsモードでは常に新しいランダムコードを生成
					this.preparePages();
					this.resetState();
					this.renderPage();
				} else if (DOM.langSel.value === "word-practice") {
					// Word Practiceモードでは新しい練習を開始
					this.resetState();
					this.renderPage();
				} else if (APP_STATE.currentPage < APP_STATE.pages.length - 1) {
					APP_STATE.currentPage++;
					this.resetState();
					this.renderPage();
					this.updatePageSelect();
				} else {
					this.restartAll();
				}
			});
		}
	},

	// 現在のページをリトライ
	retry() {
		if (DOM.overlay.style.visibility === "visible") {
			UI.hideOverlay(() => {
				if (this.isInitialSpeedMode() || DOM.langSel.value === "typewell" || DOM.langSel.value === "word-practice") {
					// Initial Speed、TypeWell、Word Practiceモードでは新しい練習を生成
					this.preparePages();
					this.resetState();
					this.renderPage();
				} else {
					this.resetState();
					this.renderPage();
				}
			});
		} else {
			if (this.isInitialSpeedMode() || DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words" || DOM.langSel.value === "word-practice") {
				// Initial Speed、TypeWell、TypeWell English Words、Word Practiceモードでは新しい練習を生成
				this.preparePages();
				this.resetState();
				this.renderPage();
			} else {
				this.resetState();
				this.renderPage();
			}
		}
	},

	// 全体をリスタート
	restartAll() {
		if (DOM.overlay.style.visibility === "visible") {
			UI.hideOverlay(() => {
				if (this.isInitialSpeedMode() || DOM.langSel.value === "typewell" || DOM.langSel.value === "word-practice") {
					// Initial Speed、TypeWell、Word Practiceモードでは新しい練習を生成
					this.preparePages();
					this.resetState();
					this.renderPage();
				} else {
					APP_STATE.currentPage = 0;
					this.resetState();
					this.renderPage();
					this.updatePageSelect();
				}
			});
		} else {
			if (this.isInitialSpeedMode() || DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words" || DOM.langSel.value === "word-practice") {
				// Initial Speed、TypeWell、TypeWell English Words、Word Practiceモードでは新しい練習を生成
				this.preparePages();
				this.resetState();
				this.renderPage();
			} else {
				APP_STATE.currentPage = 0;
				this.resetState();
				this.renderPage();
				this.updatePageSelect();
			}
		}
	},

	// キー入力の処理
	handleKeyPress(key) {
		// 休憩中の場合は入力を無視
		if (APP_STATE.isBreakActive) {
			return;
		}

		// Initial Speedモードの処理
		if (this.isInitialSpeedMode()) {
			if (APP_STATE.initialSpeedState === "waiting") {
				// スタート待機中はスペースキーまたはエンターキーで開始
				if (key === "Enter" || key === " ") {
					this.startInitialSpeedPractice();
				}
				return;
			} else if (APP_STATE.initialSpeedState === "ready") {
				// 文字入力待機中
				this.handleInitialSpeedInput(key);
				return;
			} else {
				// その他の状態では入力を無視
				return;
			}
		}

		// タイプウェルオリジナルモード・TypeWell English Wordsモードでスタート待機中の場合
		if (
			(DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") &&
			APP_STATE.typewellState === "waiting"
		) {
			if (key === "Enter" || key === " ") {
				// スペースキー対応を追加
				this.startTypeWellCountdown();
			}
			return;
		}

		// タイプウェルオリジナルモード・TypeWell English Wordsモードでカウントダウン中の場合は入力を無視
		if (
			(DOM.langSel.value === "typewell" || DOM.langSel.value === "typewell-english-words") &&
			APP_STATE.typewellState === "countdown"
		) {
			return;
		}

		const ch = key === "Enter" ? "\n" : key;
		const expectedChar =
			this.cachedTargets[APP_STATE.inputBuffer.length]?.dataset.char;

		// 最後の文字を超えて入力しようとした場合は無視
		if (APP_STATE.inputBuffer.length >= this.cachedTargets.length) {
			return;
		}

		// TypeWellモードの特別処理
		if (this.isTypeWellMode()) {
			// キーストローク数をカウント
			APP_STATE.totalKeystrokes++;

			// 期待される文字と一致するかチェック
			let isMatch = false;
			if (expectedChar) {
				// TypeWell English Wordsモードでは大文字小文字を区別しない
				if (DOM.langSel.value === "typewell-english-words") {
					if (/^[a-zA-Z]$/.test(expectedChar)) {
						isMatch = ch.toLowerCase() === expectedChar.toLowerCase();
					} else {
						isMatch = ch === expectedChar;
					}
				} else if (DOM.langSel.value === "typewell" && Utils.getSelectedTypeWellMode() === "lowercase") {
					// TypeWell小文字モードでは大文字・小文字どちらでも正解とする
					if (/^[a-z]$/.test(expectedChar)) {
						isMatch = ch.toLowerCase() === expectedChar;
					} else {
						isMatch = ch === expectedChar;
					}
				} else {
					isMatch = ch === expectedChar;
				}
			}
			
			if (isMatch) {
				// 正しい文字の場合：前回のミスタイプ表示をクリア
				const currentSpan = this.cachedTargets[APP_STATE.inputBuffer.length];
				if (currentSpan && currentSpan.classList.contains("incorrect")) {
					// 元の状態に戻す
					currentSpan.className = `char pending${currentSpan.classList.contains("newline") ? " newline" : ""}`;
					if (currentSpan.dataset.char === "\n") {
						currentSpan.textContent = "⏎";
					} else {
						// TypeWell小文字モードでは大文字表示を維持
						if (DOM.langSel.value === "typewell" && Utils.getSelectedTypeWellMode() === "lowercase" && /^[a-z]$/.test(currentSpan.dataset.char)) {
							currentSpan.textContent = currentSpan.dataset.char.toUpperCase();
						} else {
							currentSpan.textContent = currentSpan.dataset.char;
						}
					}
				}

				// 正しい文字の場合のみ進む
				APP_STATE.inputBuffer += ch;

				// 改行以外の文字は行文字数をカウント
				if (ch !== "\n") {
					APP_STATE.currentLineCharCount++;
				}

				// 正しい改行の場合のみ休憩判定
				if (ch === "\n" && expectedChar === "\n") {
					this.checkAndShowBreak();
				}
			} else {
				// ミスタイプの場合
				if (expectedChar) {
					APP_STATE.errorCount++;
					// 苦手文字として記録
					Storage.recordMistakeChar(expectedChar);
					// 現在のセッションのミス文字も記録
					if (!APP_STATE.currentMistakes) {
						APP_STATE.currentMistakes = [];
					}
					APP_STATE.currentMistakes.push(expectedChar);

					// 現在の文字を赤く表示
					const currentSpan = this.cachedTargets[APP_STATE.inputBuffer.length];
					if (currentSpan) {
						currentSpan.className = `char incorrect${currentSpan.classList.contains("newline") ? " newline" : ""}`;

						// 空白や改行の誤入力を視覚化
						if (expectedChar === " " || expectedChar === "\n") {
							if (ch === " ") {
								currentSpan.textContent = "␣";
							} else if (ch === "\n") {
								currentSpan.textContent = "↵";
							} else if (ch === "\t") {
								currentSpan.textContent = "→";
							} else {
								currentSpan.textContent = ch;
							}
						}
					}
				}
				// ミスタイプ時はinputBufferを進めない（その場で停止）
				return;
			}
		} else {
			// 通常モード（従来の処理）
			// キーストローク数をカウント
			APP_STATE.totalKeystrokes++;

			// ミスタイプかどうかチェック
			if (expectedChar && ch !== expectedChar) {
				APP_STATE.errorCount++;

				// 苦手文字として記録
				Storage.recordMistakeChar(expectedChar);

				// 現在のセッションのミス文字も記録
				if (!APP_STATE.currentMistakes) {
					APP_STATE.currentMistakes = [];
				}
				APP_STATE.currentMistakes.push(expectedChar);
			}

			// 改行の場合の特別処理
			if (ch === "\n") {
				// 正しい改行の場合のみ休憩判定を実行
				if (expectedChar === "\n") {
					this.checkAndShowBreak();
				}
			} else {
				// 改行以外の文字は行文字数をカウント
				APP_STATE.currentLineCharCount++;
			}

			APP_STATE.inputBuffer += ch;
		}

		this.updateDisplay();
	},

	// TypeWellモードでの行完了チェック
	checkTypeWellLineCompletion() {
		const currentPosition = APP_STATE.inputBuffer.length;
		const page = APP_STATE.pages[APP_STATE.currentPage];
		
		// 各行の累積文字数を計算
		let cumulativeLength = 0;
		for (let i = 0; i < page.length; i++) {
			const lineData = page[i];
			cumulativeLength += lineData.line.length;
			
			// 現在の入力位置がこの行の終端に到達し、まだ記録していない場合
			if (currentPosition === cumulativeLength && i >= APP_STATE.typewellCurrentLine) {
				const currentTime = Date.now();
				const totalElapsedTime = (currentTime - APP_STATE.startTime) / 1000;
				
				// ラップタイムを計算（前の行からの差分時間）
				let lapTime;
				if (APP_STATE.typewellLineTimes.length === 0) {
					// 1行目は開始からの時間
					lapTime = totalElapsedTime;
				} else {
					// 2行目以降は前の行の完了時刻からの差分
					const previousTotalTime = APP_STATE.typewellLineTimes.reduce((sum, lt) => sum + lt.time, 0);
					lapTime = totalElapsedTime - previousTotalTime;
				}
				
				APP_STATE.typewellLineTimes.push({
					line: i + 1,
					time: lapTime
				});
				APP_STATE.typewellCurrentLine = i + 1;
				break; // 1行完了したら処理終了
			}
			
			// 現在位置がこの行を超えていない場合は処理終了
			if (currentPosition < cumulativeLength) {
				break;
			}
		}
	},

	// バックスペースの処理
	handleBackspace() {
		// 休憩中の場合は入力を無視
		if (APP_STATE.isBreakActive) {
			return;
		}

		// Initial SpeedモードまたはTypeWellモードではバックスペース無効
		if (this.isInitialSpeedMode() || this.isTypeWellMode()) {
			return;
		}

		if (APP_STATE.inputBuffer.length > 0) {
			const lastChar = APP_STATE.inputBuffer[APP_STATE.inputBuffer.length - 1];

			// バックスペースで削除された文字が改行以外の場合、行文字数を減らす
			if (lastChar !== "\n" && APP_STATE.currentLineCharCount > 0) {
				APP_STATE.currentLineCharCount--;
			}

			APP_STATE.inputBuffer = APP_STATE.inputBuffer.slice(0, -1);
			this.updateDisplay();
		}
	},

	// Word Practice関連機能

	// Word Practice開始ボタンのクリックハンドラー
	startWordPracticeFromClick() {
		if (
			DOM.langSel.value === "word-practice" &&
			APP_STATE.wordPracticeState === "waiting"
		) {
			this.startWordPracticePractice();
		}
	},

	// Word Practice練習の開始
	startWordPracticePractice() {
		// 設定を取得
		const selectedSet = document.querySelector('input[name="word-practice-set"]:checked');
		const setName = selectedSet ? selectedSet.value : 'top500';
		const wordCount = parseInt(DOM.wordPracticeCountSelect?.value || '10');

		// 単語リストを取得
		const allWords = getWordsBySet(setName);
		
		// 指定された数の単語をランダムに選択
		APP_STATE.wordPracticeWords = this.selectRandomWords(allWords, wordCount);
		APP_STATE.wordPracticeTotalWords = wordCount;
		APP_STATE.wordPracticeCurrentWord = 0;
		APP_STATE.wordPracticeResults = [];
		APP_STATE.wordPracticeState = "starting";

		// 練習画面を表示
		this.showWordPracticePracticeScreen();

		// 1秒待機後に最初の単語を表示
		setTimeout(() => {
			if (APP_STATE.wordPracticeState === "starting") {
				APP_STATE.wordPracticeState = "practicing";
				this.displayCurrentWord();
			}
		}, 1000);

		// 入力フィールドにフォーカスを設定
		if (DOM.inputEl) {
			DOM.inputEl.focus();
		}
	},

	// ランダムに単語を選択
	selectRandomWords(wordList, count) {
		const shuffled = [...wordList].sort(() => 0.5 - Math.random());
		return shuffled.slice(0, count);
	},

	// Word Practice練習画面の表示
	showWordPracticePracticeScreen() {
		// 他の画面を非表示
		UI.hideAllSpecialScreens();
		
		// 前回の単語表示をクリア
		if (DOM.wordPracticeWord) {
			DOM.wordPracticeWord.textContent = "";
			DOM.wordPracticeWord.className = "word-practice-word";
			// 進捗表示の上下動を防ぐため最小高さを設定（縦長に調整）
			DOM.wordPracticeWord.style.minHeight = "80px";
			DOM.wordPracticeWord.style.lineHeight = "80px";
		}
		
		// 前回の進捗表示をクリア（固定高さ設定）
		if (DOM.wordPracticeProgress) {
			DOM.wordPracticeProgress.textContent = "";
			DOM.wordPracticeProgress.style.height = "30px";
			DOM.wordPracticeProgress.style.lineHeight = "30px";
		}
		
		// Word Practice練習画面を表示
		if (DOM.wordPracticePracticeScreen) {
			DOM.wordPracticePracticeScreen.style.display = "flex";
		}
		
		// 通常のコード表示を隠す
		if (DOM.codeEl) {
			DOM.codeEl.style.display = "none";
		}
	},

	// 現在の単語を表示
	displayCurrentWord() {
		const currentWordData = APP_STATE.wordPracticeWords[APP_STATE.wordPracticeCurrentWord];
		
		if (DOM.wordPracticeWord && currentWordData) {
			DOM.wordPracticeWord.textContent = currentWordData;
			DOM.wordPracticeWord.className = "word-practice-word";
		}

		// 進捗更新
		this.updateWordPracticeProgress();

		// 単語開始時間を記録
		APP_STATE.wordPracticeWordStartTime = Date.now();
		APP_STATE.wordPracticeFirstKeyPressed = false;
		APP_STATE.inputBuffer = "";
	},

	// Word Practice進捗更新
	updateWordPracticeProgress() {
		if (DOM.wordPracticeProgress) {
			const progress = `${APP_STATE.wordPracticeCurrentWord + 1} / ${APP_STATE.wordPracticeTotalWords}`;
			DOM.wordPracticeProgress.textContent = progress;
		}
	},

	// Word Practiceキー入力処理（TypeWellモード同様の厳格な入力方式）
	handleWordPracticeInput(key) {
		if (APP_STATE.wordPracticeState !== "practicing") {
			return;
		}

		const currentWord = APP_STATE.wordPracticeWords[APP_STATE.wordPracticeCurrentWord];
		if (!currentWord) return;

		// 最初のキー押下時間を記録
		if (!APP_STATE.wordPracticeFirstKeyPressed) {
			APP_STATE.wordPracticeFirstKeyTime = Date.now();
			APP_STATE.wordPracticeFirstKeyPressed = true;
		}

		// スペースキーで単語完了（入力が完全に一致している場合のみ）
		if (key === " ") {
			if (APP_STATE.inputBuffer === currentWord) {
				this.completeCurrentWord();
			}
			return;
		}

		// 通常の文字入力 - TypeWellモード同様の厳格な処理
		if (key.length === 1) {
			const currentPosition = APP_STATE.inputBuffer.length;
			const expectedChar = currentWord[currentPosition];
			
			if (expectedChar && key === expectedChar) {
				// 正しい文字の場合のみ進む
				APP_STATE.inputBuffer += key;
				this.updateWordPracticeDisplay();
				
				// 単語が完全に一致した場合は完了
				if (APP_STATE.inputBuffer === currentWord) {
					this.completeCurrentWord();
				}
			} else {
				// ミスタイプの場合はその場で停止（TypeWellモード同様）
				// 視覚的にミスを表示
				this.showWordPracticeError();
			}
		}
	},

	// Word Practiceエラー表示
	showWordPracticeError() {
		// TypeWell Originalモード同様に、ミス位置の文字を赤く表示
		const currentWord = APP_STATE.wordPracticeWords[APP_STATE.wordPracticeCurrentWord];
		const input = APP_STATE.inputBuffer;
		
		if (DOM.wordPracticeWord && currentWord) {
			let displayHtml = '';
			
			for (let i = 0; i < currentWord.length; i++) {
				const char = currentWord[i];
				if (i < input.length) {
					if (input[i] === char) {
						displayHtml += `<span class="correct">${char}</span>`;
					} else {
						displayHtml += `<span class="incorrect">${char}</span>`;
					}
				} else if (i === input.length) {
					// ミスした位置の文字のみ赤く表示（TypeWell同様）
					displayHtml += `<span class="char incorrect">${char}</span>`;
				} else {
					// ミス時は他の文字を完全に通常色で表示（グレー表示禁止）
					displayHtml += `<span style="color: var(--text-color);">${char}</span>`;
				}
			}
			
			DOM.wordPracticeWord.innerHTML = displayHtml;
			
			// 色を元に戻す処理は不要（ミス時は正しい文字が入力されるまで赤いまま）
		}
	},

	// Word Practice表示更新
	updateWordPracticeDisplay() {
		const currentWord = APP_STATE.wordPracticeWords[APP_STATE.wordPracticeCurrentWord];
		const input = APP_STATE.inputBuffer;
		
		if (DOM.wordPracticeWord && currentWord) {
			let displayHtml = '';
			
			for (let i = 0; i < currentWord.length; i++) {
				const char = currentWord[i];
				if (i < input.length) {
					if (input[i] === char) {
						displayHtml += `<span class="correct">${char}</span>`;
					} else {
						displayHtml += `<span class="incorrect">${char}</span>`;
					}
				} else {
					// 入力開始前のみグレー表示、入力開始後は完全に通常色で表示
					if (input.length === 0) {
						displayHtml += `<span class="pending">${char}</span>`;
					} else {
						// 入力開始後は一切グレー表示しない（通常色のみ）
						displayHtml += `<span style="color: var(--text-color);">${char}</span>`;
					}
				}
			}
			
			DOM.wordPracticeWord.innerHTML = displayHtml;
		}
	},

	// 現在の単語を完了
	completeCurrentWord() {
		const currentWord = APP_STATE.wordPracticeWords[APP_STATE.wordPracticeCurrentWord];
		const input = APP_STATE.inputBuffer.trim();
		const wordEndTime = Date.now();
		
		// 結果を記録
		const firstKeyTime = APP_STATE.wordPracticeFirstKeyTime - APP_STATE.wordPracticeWordStartTime;
		const totalWordTime = wordEndTime - APP_STATE.wordPracticeWordStartTime;
		const isCorrect = input === currentWord;
		
		// 個別単語のWPM計算（分間文字数ベース - プロジェクト標準）
		let wordWPM = 0;
		if (isCorrect && totalWordTime > 0) {
			const minutes = totalWordTime / 60000; // ミリ秒を分に変換
			const characters = currentWord.length;
			wordWPM = Math.round(characters / minutes); // 分間文字数として計算
		}
		
		const wordResult = {
			word: currentWord,
			input: input,
			correct: isCorrect,
			firstKeyTime: firstKeyTime,
			wordTime: totalWordTime,
			wordWPM: wordWPM
		};
		
		APP_STATE.wordPracticeResults.push(wordResult);

		// 次の単語へ
		APP_STATE.wordPracticeCurrentWord++;
		
		if (APP_STATE.wordPracticeCurrentWord >= APP_STATE.wordPracticeTotalWords) {
			// 全単語完了
			this.completeWordPracticePractice();
		} else {
			// 次の単語への待機時間（1秒）を設定
			APP_STATE.wordPracticeState = "waiting_next_word";
			
			// 現在の単語表示をクリア
			if (DOM.wordPracticeWord) {
				DOM.wordPracticeWord.textContent = "";
				DOM.wordPracticeWord.className = "word-practice-word";
				// 最小高さを維持して進捗表示の位置を安定させる（縦長に調整）
				DOM.wordPracticeWord.style.minHeight = "80px";
				DOM.wordPracticeWord.style.lineHeight = "80px";
			}
			
			// 正解した場合はタイム表示（Initial Speedモード同様）
			if (isCorrect && totalWordTime > 0 && DOM.wordPracticeStatus) {
				DOM.wordPracticeStatus.textContent = Utils.formatReactionTime(totalWordTime);
				DOM.wordPracticeStatus.className = "word-practice-status completion-time";
			}
			
			// 1秒後に次の単語を表示
			setTimeout(() => {
				if (APP_STATE.wordPracticeState === "waiting_next_word") {
					// タイム表示をクリア
					if (DOM.wordPracticeStatus) {
						DOM.wordPracticeStatus.textContent = "";
						DOM.wordPracticeStatus.className = "word-practice-status";
					}
					APP_STATE.wordPracticeState = "practicing";
					this.displayCurrentWord();
				}
			}, 1000);
		}
	},

	// Word Practice練習完了
	completeWordPracticePractice() {
		APP_STATE.wordPracticeState = "completed";

		// 統計計算
		const results = APP_STATE.wordPracticeResults;
		const correctResults = results.filter(r => r.correct);
		
		const stats = {
			averageFirstKeyTime: correctResults.length > 0 ? 
				Math.round(correctResults.reduce((sum, r) => sum + r.firstKeyTime, 0) / correctResults.length) : 0,
			averageWordTime: correctResults.length > 0 ? 
				Math.round(correctResults.reduce((sum, r) => sum + r.wordTime, 0) / correctResults.length) : 0,
			totalTime: results.reduce((sum, r) => sum + r.wordTime, 0) / 1000,
			averageWPM: correctResults.length > 0 ? 
				Math.round(correctResults.reduce((sum, r) => sum + r.wordWPM, 0) / correctResults.length) : 0,
			accuracy: Math.round((correctResults.length / results.length) * 100),
			wordCount: results.length
		};

		// 統計をAPP_STATEに保存して、UI.jsで使用できるようにする
		APP_STATE.wordPracticeStats = stats;

		// 結果画面表示
		UI.showWordPracticeResults(stats);

		// オーバーレイ表示
		UI.hideAllSpecialScreens();
		UI.showOverlay(correctResults.length, results.length);
	},

	// Word Practice用のバックスペース処理
	handleWordPracticeBackspace() {
		if (APP_STATE.wordPracticeState === "practicing" && APP_STATE.inputBuffer.length > 0) {
			APP_STATE.inputBuffer = APP_STATE.inputBuffer.slice(0, -1);
			this.updateWordPracticeDisplay();
		}
	},
};
