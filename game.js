// ゲーム状態管理
class PentarollGame {
    constructor() {
        this.board = Array(6).fill().map(() => Array(6).fill(0));
        this.currentPlayer = 1; // 1: プレイヤー1(赤), 2: プレイヤー2/CPU(青)
        this.gameMode = 'pvp'; // 'pvp' or 'pvc'
        this.gameOver = false;
        this.winner = null;
        this.canvas = null;
        this.ctx = null;
        this.cellSize = 70; // セルサイズを少し小さく
        this.boardOffset = { x: 0, y: 0 }; // 動的に計算される
        this.animating = false;
        this.cpuThinking = false; // CPU思考中フラグ
        this.selectedPosition = null;
        this.availableDirections = [];
        this.showingArrows = false;
        this.directionButtons = []; // HTMLボタンの配列
        
        this.cleanupPreviousSources(); // 前のリソースをクリーンアップ
        this.initializeCanvas();
        this.setupEventListeners();
    }

    // 前のリソースを完全にクリーンアップ
    cleanupPreviousSources() {
        // 既存の方向ボタンを削除
        this.removeDirectionButtons();
        
        // 既存のイベントリスナーを削除
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            const newCanvas = canvas.cloneNode(true);
            canvas.parentNode.replaceChild(newCanvas, canvas);
        }
        
        // Windowイベントリスナーを削除
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            window.removeEventListener('orientationchange', this.resizeHandler);
        }
        
        // 全てのキャンバスをクリア
        const canvases = ['gameCanvas', 'finalBoardCanvas'];
        canvases.forEach(canvasId => {
            const canvasEl = document.getElementById(canvasId);
            if (canvasEl) {
                const ctx = canvasEl.getContext('2d');
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                ctx.restore();
            }
        });
    }

    initializeCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Canvas要素の表示サイズを取得
        const rect = this.canvas.getBoundingClientRect();
        
        // Canvasの内部解像度と表示サイズの関係を考慮
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // セルサイズを動的に計算（Canvas内部解像度に基づく）
        const availableWidth = canvasWidth * 0.8; // マージンを考慮
        const availableHeight = canvasHeight * 0.8; // マージンを考慮
        this.cellSize = Math.min(availableWidth / 6, availableHeight / 6);
        
        // キャンバスサイズに基づいて盤面を中央に配置
        const boardSize = this.cellSize * 6; // 6x6のボードサイズ
        this.boardOffset.x = (canvasWidth - boardSize) / 2;
        this.boardOffset.y = (canvasHeight - boardSize) / 2;
        
        console.log('Canvas initialized:', {
            canvasSize: { width: canvasWidth, height: canvasHeight },
            displaySize: { width: rect.width, height: rect.height },
            cellSize: this.cellSize,
            boardOffset: this.boardOffset
        });
        
        // 完全にキャンバスをクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBoard();
    }

    setupEventListeners() {
        // タッチイベントとクリックイベントの両方に対応
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // スクロールなどのデフォルト動作を防ぐ
            this.handleCanvasTouch(e);
        });
        
        // タッチ中のスクロールを防ぐ
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        });
        
        // 画面サイズ変更時の対応
        this.resizeHandler = () => {
            setTimeout(() => {
                this.initializeCanvas();
            }, 100);
        };
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('orientationchange', this.resizeHandler);
    }

    // 端の位置かどうかを判定
    isEdgePosition(row, col) {
        return row === 0 || row === 5 || col === 0 || col === 5;
    }

    // 角の位置かどうかを判定
    isCornerPosition(row, col) {
        return (row === 0 || row === 5) && (col === 0 || col === 5);
    }

    // 指定した位置から可能な方向を取得（修正版）
    getAvailableDirections(row, col) {
        const directions = [];
        
        if (this.isCornerPosition(row, col)) {
            // 角の場合は3方向（直線2方向＋斜め1方向）
            if (row === 0 && col === 0) {
                directions.push('Right', 'Down', 'DownRight');
            } else if (row === 0 && col === 5) {
                directions.push('Left', 'Down', 'DownLeft');  
            } else if (row === 5 && col === 0) {
                directions.push('Right', 'Up', 'UpRight');
            } else if (row === 5 && col === 5) {
                directions.push('Left', 'Up', 'UpLeft');
            }
        } else if (row === 0) {
            // 上端：下方向のみ
            directions.push('Down');
        } else if (row === 5) {
            // 下端：上方向のみ
            directions.push('Up');
        } else if (col === 0) {
            // 左端：右方向のみ
            directions.push('Right');
        } else if (col === 5) {
            // 右端：左方向のみ
            directions.push('Left');
        }
        
        return directions;
    }

    // 方向に基づく移動ベクトルを取得
    getDirectionVector(direction) {
        const vectors = {
            'Up': [-1, 0],
            'Down': [1, 0],
            'Left': [0, -1],
            'Right': [0, 1],
            'UpLeft': [-1, -1],
            'UpRight': [-1, 1],
            'DownLeft': [1, -1],
            'DownRight': [1, 1]
        };
        return vectors[direction];
    }

    // ボールを配置可能かチェック（押し出しを考慮）
    canPlaceBall(row, col) {
        if (!this.isEdgePosition(row, col)) {
            return false;
        }

        // 空の場合は配置可能
        if (this.board[row][col] === 0) {
            return true;
        }

        // ボールがある場合、押し出し可能かチェック
        const directions = this.getAvailableDirections(row, col);
        
        for (const direction of directions) {
            if (this.canPushInDirection(row, col, direction)) {
                return true;
            }
        }
        
        return false;
    }

    // 指定方向への押し出しが可能かチェック（修正版）
    canPushInDirection(startRow, startCol, direction) {
        const [dRow, dCol] = this.getDirectionVector(direction);
        let currentRow = startRow;
        let currentCol = startCol;
        
        // 連続するボールの数をカウント
        let ballCount = 0;
        while (currentRow >= 0 && currentRow < 6 && currentCol >= 0 && currentCol < 6 && 
               this.board[currentRow][currentCol] !== 0) {
            ballCount++;
            currentRow += dRow;
            currentCol += dCol;
        }
        
        // 押し出し後の最後のボールの位置をチェック
        const lastBallNewRow = startRow + (ballCount * dRow);
        const lastBallNewCol = startCol + (ballCount * dCol);
        
        // 盤面外に押し出される場合は不可
        if (lastBallNewRow < 0 || lastBallNewRow >= 6 || lastBallNewCol < 0 || lastBallNewCol >= 6) {
            return false;
        }
        
        return true;
    }

    // キャンバスクリック処理（修正版）
    handleCanvasClick(e) {
        // 操作不可の条件をチェック
        if (this.animating || this.gameOver || this.cpuThinking) return;
        if (this.gameMode === 'pvc' && this.currentPlayer === 2) return; // CPU のターン中

        const coords = this.getCanvasCoordinates(e.clientX, e.clientY);
        this.handlePositionInput(coords.x, coords.y);
    }

    // タッチイベント処理
    handleCanvasTouch(e) {
        // 操作不可の条件をチェック
        if (this.animating || this.gameOver || this.cpuThinking) return;
        if (this.gameMode === 'pvc' && this.currentPlayer === 2) return; // CPU のターン中

        // 方向選択中の場合はタッチを無視（ボタンで選択）
        if (this.showingArrows) {
            return;
        }

        const touch = e.touches[0];
        const coords = this.getCanvasCoordinates(touch.clientX, touch.clientY);
        this.handlePositionInput(coords.x, coords.y);
    }

    // Canvas座標を正確に計算
    getCanvasCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        
        // デバッグ用ログ
        console.log('Canvas rect:', rect);
        console.log('Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);
        console.log('Client coordinates:', clientX, clientY);
        
        // Canvas要素の実際の表示サイズを取得
        const displayWidth = rect.width;
        const displayHeight = rect.height;
        
        // Canvas要素の内部解像度を取得
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // 表示サイズと内部解像度の比率を計算
        const scaleX = canvasWidth / displayWidth;
        const scaleY = canvasHeight / displayHeight;
        
        console.log('Scale factors:', scaleX, scaleY);
        
        // クリック/タッチ位置を Canvas の内部座標系に変換
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        
        console.log('Calculated coordinates:', x, y);
        console.log('Board offset:', this.boardOffset);
        console.log('Cell size:', this.cellSize);
        
        return { x, y };
    }

    // 位置入力の共通処理
    handlePositionInput(x, y) {
        // 方向選択中の場合は入力を無視（ボタンで選択）
        if (this.showingArrows) {
            return;
        }
        
        // デバッグ用：タッチした位置に赤い点を描画
        this.ctx.fillStyle = 'red';
        this.ctx.beginPath();
        this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
        this.ctx.fill();
        
        const col = Math.floor((x - this.boardOffset.x) / this.cellSize);
        const row = Math.floor((y - this.boardOffset.y) / this.cellSize);
        
        console.log('Position calculation:', {
            input: { x, y },
            boardOffset: this.boardOffset,
            cellSize: this.cellSize,
            calculated: { row, col },
            isEdge: this.isEdgePosition(row, col)
        });
        
        if (row >= 0 && row < 6 && col >= 0 && col < 6 && this.isEdgePosition(row, col)) {
            console.log('Valid position clicked:', row, col);
            this.handlePositionClick(row, col);
        } else {
            console.log('Invalid position clicked:', row, col);
        }
        
        // デバッグ用の点を2秒後に消去
        setTimeout(() => {
            this.drawBoard();
        }, 2000);
    }

    // 位置クリック処理（修正版）
    handlePositionClick(row, col) {
        if (!this.canPlaceBall(row, col)) {
            return;
        }

        if (this.board[row][col] === 0) {
            // 空の場合はそのまま配置
            this.placeBall(row, col, this.currentPlayer);
        } else {
            // ボールがある場合
            this.selectedPosition = { row, col };
            this.availableDirections = this.getAvailableDirections(row, col).filter(
                direction => this.canPushInDirection(row, col, direction)
            );
            
            if (this.availableDirections.length === 0) {
                return;
            } else if (this.availableDirections.length === 1) {
                // 1方向しかない場合は自動で移動
                this.pushBalls(row, col, this.availableDirections[0]);
            } else {
                // 複数方向がある場合（角のボール）はHTMLボタンを表示
                this.showDirectionButtons(row, col);
            }
        }
    }

    // 方向選択HTMLボタンを表示
    showDirectionButtons(row, col) {
        this.showingArrows = true;
        this.removeDirectionButtons(); // 既存のボタンを削除
        
        // ボールの画面上の位置を計算（修正版）
        const rect = this.canvas.getBoundingClientRect();
        
        // Canvas内部座標系でのボール位置を計算
        const ballCanvasX = this.boardOffset.x + col * this.cellSize + this.cellSize / 2;
        const ballCanvasY = this.boardOffset.y + row * this.cellSize + this.cellSize / 2;
        
        // Canvas座標を画面座標に変換（より正確な変換）
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // Canvas要素の実際の表示サイズ
        const displayWidth = rect.width;
        const displayHeight = rect.height;
        
        // スケール比率を計算
        const scaleX = displayWidth / canvasWidth;
        const scaleY = displayHeight / canvasHeight;
        
        // 画面座標を計算
        const ballX = rect.left + (ballCanvasX * scaleX);
        const ballY = rect.top + (ballCanvasY * scaleY);
        
        // ページスクロール位置を考慮
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        
        const finalBallX = ballX + scrollX;
        const finalBallY = ballY + scrollY;
        
        console.log('Direction button positioning:', {
            rect: rect,
            canvasSize: { width: canvasWidth, height: canvasHeight },
            displaySize: { width: displayWidth, height: displayHeight },
            scale: { x: scaleX, y: scaleY },
            ballCanvas: { x: ballCanvasX, y: ballCanvasY },
            ballScreen: { x: ballX, y: ballY },
            finalBall: { x: finalBallX, y: finalBallY },
            scroll: { x: scrollX, y: scrollY }
        });
        
        // オーバーレイを作成（ボタン以外のクリックでキャンセル）
        const overlay = document.createElement('div');
        overlay.className = 'direction-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.3);
            z-index: 999;
            backdrop-filter: blur(2px);
        `;
        
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideDirectionButtons();
        });
        
        document.body.appendChild(overlay);
        this.directionButtons.push(overlay);
        
        // 方向ボタンを作成
        this.availableDirections.forEach(direction => {
            const button = document.createElement('button');
            button.textContent = this.getDirectionSymbol(direction);
            button.className = 'direction-btn';
            button.style.cssText = `
                position: absolute;
                width: 60px;
                height: 60px;
                border: none;
                border-radius: 50%;
                background: linear-gradient(145deg, #667eea 0%, #764ba2 100%);
                color: #ffffff;
                font-size: 20px;
                font-weight: bold;
                cursor: pointer;
                z-index: 1000;
                box-shadow: 
                    0 8px 32px rgba(102, 126, 234, 0.4),
                    inset 0 2px 4px rgba(255, 255, 255, 0.3),
                    inset 0 -2px 4px rgba(0, 0, 0, 0.2);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
                touch-action: manipulation;
                transform: scale(0.8);
                animation: bounceIn 0.5s ease forwards;
            `;
            
            // ボタンの位置を設定（修正版）
            const [dRow, dCol] = this.getDirectionVector(direction);
            
            // より大きな距離でボタンを配置（スマホでタッチしやすくするため）
            const buttonDistance = Math.min(80, Math.min(displayWidth, displayHeight) * 0.15);
            
            const btnX = finalBallX + dCol * buttonDistance - 30; // ボタン幅の半分
            const btnY = finalBallY + dRow * buttonDistance - 30; // ボタン高さの半分
            
            // 画面外に出ないように調整
            const adjustedBtnX = Math.max(10, Math.min(btnX, window.innerWidth - 70));
            const adjustedBtnY = Math.max(10, Math.min(btnY, window.innerHeight - 70));
            
            button.style.left = adjustedBtnX + 'px';
            button.style.top = adjustedBtnY + 'px';
            
            console.log(`Button ${direction}:`, {
                direction: [dRow, dCol],
                distance: buttonDistance,
                calculated: { x: btnX, y: btnY },
                adjusted: { x: adjustedBtnX, y: adjustedBtnY }
            });
            
            // ホバー効果
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'scale(1.1)';
                button.style.background = 'linear-gradient(145deg, #764ba2 0%, #667eea 100%)';
                button.style.boxShadow = `
                    0 12px 40px rgba(102, 126, 234, 0.6),
                    inset 0 2px 4px rgba(255, 255, 255, 0.4),
                    inset 0 -2px 4px rgba(0, 0, 0, 0.3)
                `;
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'scale(1)';
                button.style.background = 'linear-gradient(145deg, #667eea 0%, #764ba2 100%)';
                button.style.boxShadow = `
                    0 8px 32px rgba(102, 126, 234, 0.4),
                    inset 0 2px 4px rgba(255, 255, 255, 0.3),
                    inset 0 -2px 4px rgba(0, 0, 0, 0.2)
                `;
            });
            
            // クリックイベント（修正版）
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('矢印ボタンクリック:', direction); // デバッグ用
                
                // クリックアニメーション
                button.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    this.selectDirection(direction);
                }, 100);
            });

            // タッチイベントを追加
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('矢印ボタンタッチ:', direction); // デバッグ用
                
                // タッチアニメーション
                button.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    this.selectDirection(direction);
                }, 100);
            });
            
            document.body.appendChild(button);
            this.directionButtons.push(button);
        });
        
        // CSSアニメーションを追加
        if (!document.getElementById('directionButtonStyles')) {
            const style = document.createElement('style');
            style.id = 'directionButtonStyles';
            style.textContent = `
                @keyframes bounceIn {
                    0% {
                        opacity: 0;
                        transform: scale(0.3) rotate(180deg);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.05) rotate(0deg);
                    }
                    70% {
                        transform: scale(0.9) rotate(0deg);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) rotate(0deg);
                    }
                }
                
                @keyframes pulse {
                    0% { box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4); }
                    50% { box-shadow: 0 8px 32px rgba(102, 126, 234, 0.8); }
                    100% { box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4); }
                }
                
                .direction-btn:active {
                    transform: scale(0.95) !important;
                    transition: transform 0.1s ease;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 方向記号を取得
    getDirectionSymbol(direction) {
        const symbols = {
            'Up': '↑',
            'Down': '↓',
            'Left': '←',
            'Right': '→',
            'UpLeft': '↖',
            'UpRight': '↗',
            'DownLeft': '↙',
            'DownRight': '↘'
        };
        return symbols[direction] || '?';
    }

    // 方向ボタンを非表示
    hideDirectionButtons() {
        this.removeDirectionButtons();
        this.showingArrows = false;
        this.selectedPosition = null;
        this.availableDirections = [];
    }

    // 方向ボタンを削除
    removeDirectionButtons() {
        this.directionButtons.forEach(button => {
            if (button && button.parentNode) {
                button.parentNode.removeChild(button);
            }
        });
        this.directionButtons = [];
    }

    // 方向選択（修正版）
    selectDirection(direction) {
        console.log('方向選択:', direction, 'selectedPosition:', this.selectedPosition); // デバッグ用
        
        if (!this.selectedPosition) {
            console.log('selectedPositionがありません');
            this.hideDirectionButtons();
            return;
        }
        
        // ボタンを非表示にする前に位置を保存
        const pos = { ...this.selectedPosition };
        this.hideDirectionButtons();
        
        // アニメーション中かチェック
        if (this.animating) {
            console.log('アニメーション中のため実行をスキップ');
            return;
        }
        
        console.log('pushBalls実行:', pos.row, pos.col, direction);
        this.pushBalls(pos.row, pos.col, direction);
    }

    // ボール押し出し処理（修正版）
    async pushBalls(startRow, startCol, direction) {
        console.log('pushBalls開始:', startRow, startCol, direction); // デバッグ用
        
        if (this.animating) {
            console.log('既にアニメーション中');
            return;
        }
        
        this.animating = true;
        const [dRow, dCol] = this.getDirectionVector(direction);
        const ballsToMove = [];
        
        // 押し出すボールの列を取得
        let currentRow = startRow;
        let currentCol = startCol;
        
        while (currentRow >= 0 && currentRow < 6 && currentCol >= 0 && currentCol < 6 && 
               this.board[currentRow][currentCol] !== 0) {
            ballsToMove.push({
                row: currentRow,
                col: currentCol,
                player: this.board[currentRow][currentCol]
            });
            currentRow += dRow;
            currentCol += dCol;
        }
        
        console.log('移動するボール:', ballsToMove); // デバッグ用
        
        // 移動先がボード内かチェック
        const canMove = ballsToMove.every(ball => {
            const newRow = ball.row + dRow;
            const newCol = ball.col + dCol;
            return newRow >= 0 && newRow < 6 && newCol >= 0 && newCol < 6;
        });
        
        if (!canMove) {
            console.log('移動先がボード外のため移動をキャンセル');
            this.animating = false;
            return;
        }
        
        // アニメーション実行
        await this.animatePush(ballsToMove, dRow, dCol);
        
        // ボードの状態を更新
        ballsToMove.forEach(ball => {
            this.board[ball.row][ball.col] = 0;
        });
        
        ballsToMove.forEach(ball => {
            const newRow = ball.row + dRow;
            const newCol = ball.col + dCol;
            if (newRow >= 0 && newRow < 6 && newCol >= 0 && newCol < 6) {
                this.board[newRow][newCol] = ball.player;
            }
        });
        
        // 新しいボールを配置
        this.board[startRow][startCol] = this.currentPlayer;
        
        this.drawBoard();
        this.checkWin();
        
        if (!this.gameOver) {
            this.switchPlayer();
        }
        
        this.animating = false;
        console.log('pushBalls完了'); // デバッグ用
    }

    // ボール配置
    placeBall(row, col, player) {
        this.board[row][col] = player;
        this.drawBoard();
        this.checkWin();
        
        if (!this.gameOver) {
            this.switchPlayer();
        }
    }

    // プレイヤー切り替え
    switchPlayer() {
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.updatePlayerDisplay();
        
        if (this.gameMode === 'pvc' && this.currentPlayer === 2) {
            // CPU思考開始
            this.cpuThinking = true;
            this.updatePlayerDisplay(); // "CPUが考え中..."表示
            setTimeout(() => {
                this.cpuMove();
                this.cpuThinking = false;
            }, 1500); // 少し長めの思考時間
        }
    }

    // プレイヤー表示更新
    updatePlayerDisplay() {
        const playerDisplay = document.getElementById('currentPlayer');
        if (this.gameMode === 'pvc') {
            if (this.currentPlayer === 1) {
                playerDisplay.textContent = 'あなたのターン';
            } else if (this.cpuThinking) {
                playerDisplay.textContent = 'CPUが考え中...';
            } else {
                playerDisplay.textContent = 'CPUのターン';
            }
        } else {
            playerDisplay.textContent = `プレイヤー${this.currentPlayer}のターン`;
        }
    }

    // 勝利判定
    checkWin() {
        // 5個並びをチェック
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.board[row][col] !== 0) {
                    const player = this.board[row][col];
                    
                    // 横方向
                    if (col <= 1 && this.checkLine(row, col, 0, 1, player)) {
                        this.gameOver = true;
                        this.winner = player;
                        this.showResult();
                        return;
                    }
                    
                    // 縦方向
                    if (row <= 1 && this.checkLine(row, col, 1, 0, player)) {
                        this.gameOver = true;
                        this.winner = player;
                        this.showResult();
                        return;
                    }
                    
                    // 斜め方向（右下）
                    if (row <= 1 && col <= 1 && this.checkLine(row, col, 1, 1, player)) {
                        this.gameOver = true;
                        this.winner = player;
                        this.showResult();
                        return;
                    }
                    
                    // 斜め方向（左下）
                    if (row <= 1 && col >= 4 && this.checkLine(row, col, 1, -1, player)) {
                        this.gameOver = true;
                        this.winner = player;
                        this.showResult();
                        return;
                    }
                }
            }
        }
        
        // 引き分けチェック
        if (this.isBoardFull()) {
            this.gameOver = true;
            this.winner = 0; // 引き分け
            this.showResult();
        }
    }

    // ライン判定
    checkLine(startRow, startCol, dRow, dCol, player) {
        for (let i = 0; i < 5; i++) {
            const row = startRow + i * dRow;
            const col = startCol + i * dCol;
            if (row < 0 || row >= 6 || col < 0 || col >= 6 || this.board[row][col] !== player) {
                return false;
            }
        }
        return true;
    }

    // ボード満了チェック
    isBoardFull() {
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.isEdgePosition(row, col) && this.board[row][col] === 0) {
                    return false;
                }
            }
        }
        return true;
    }

    // アニメーション実行
    async animatePush(ballsToMove, dRow, dCol) {
        const animationDuration = 500;
        const frameRate = 60;
        const totalFrames = Math.floor(animationDuration / (1000 / frameRate));
        
        for (let frame = 0; frame <= totalFrames; frame++) {
            const progress = frame / totalFrames;
            const easeProgress = this.easeInOutQuad(progress);
            
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.drawBoardBase();
            
            // 動かないボールを描画
            for (let row = 0; row < 6; row++) {
                for (let col = 0; col < 6; col++) {
                    if (this.board[row][col] !== 0) {
                        const isMoving = ballsToMove.some(ball => ball.row === row && ball.col === col);
                        if (!isMoving) {
                            this.drawBall(row, col, this.board[row][col]);
                        }
                    }
                }
            }
            
            // 動いているボールを描画
            ballsToMove.forEach(ball => {
                const currentRow = ball.row + dRow * easeProgress;
                const currentCol = ball.col + dCol * easeProgress;
                this.drawBallAt(currentRow, currentCol, ball.player);
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000 / frameRate));
        }
    }

    // イージング関数
    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    // ボード描画（修正版）
    drawBoard() {
        // 完全にキャンバスをクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBoardBase();
        
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.board[row][col] !== 0) {
                    this.drawBall(row, col, this.board[row][col]);
                }
            }
        }
    }

    // ボード基盤描画
    drawBoardBase() {
        const ctx = this.ctx;
        
        // ボードの影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(this.boardOffset.x + 5, this.boardOffset.y + 5, 
                    this.cellSize * 6, this.cellSize * 6);
        
        // ボードベース
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.boardOffset.x, this.boardOffset.y, 
                    this.cellSize * 6, this.cellSize * 6);
        
        // グリッド線
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        
        for (let i = 0; i <= 6; i++) {
            // 縦線
            ctx.beginPath();
            ctx.moveTo(this.boardOffset.x + i * this.cellSize, this.boardOffset.y);
            ctx.lineTo(this.boardOffset.x + i * this.cellSize, this.boardOffset.y + this.cellSize * 6);
            ctx.stroke();
            
            // 横線
            ctx.beginPath();
            ctx.moveTo(this.boardOffset.x, this.boardOffset.y + i * this.cellSize);
            ctx.lineTo(this.boardOffset.x + this.cellSize * 6, this.boardOffset.y + i * this.cellSize);
            ctx.stroke();
        }
        
        // 端のマスをハイライト
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.isEdgePosition(row, col)) {
                    ctx.fillRect(this.boardOffset.x + col * this.cellSize + 1,
                               this.boardOffset.y + row * this.cellSize + 1,
                               this.cellSize - 2, this.cellSize - 2);
                }
            }
        }
    }

    // ボール描画
    drawBall(row, col, player) {
        this.drawBallAt(row, col, player);
    }

    // 指定位置にボール描画
    drawBallAt(row, col, player) {
        const ctx = this.ctx;
        const x = this.boardOffset.x + col * this.cellSize + this.cellSize / 2;
        const y = this.boardOffset.y + row * this.cellSize + this.cellSize / 2;
        const radius = this.cellSize * 0.3;
        
        // ボールの影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(x + 3, y + 3, radius, radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // ボールのグラデーション
        const gradient = ctx.createRadialGradient(
            x - radius * 0.3, y - radius * 0.3, 0,
            x, y, radius
        );
        
        if (player === 1) {
            // 赤いボール
            gradient.addColorStop(0, '#FF8A80');
            gradient.addColorStop(0.7, '#FF5722');
            gradient.addColorStop(1, '#D32F2F');
        } else {
            // 緑のボール
            gradient.addColorStop(0, '#A5D6A7');
            gradient.addColorStop(0.7, '#4CAF50');
            gradient.addColorStop(1, '#2E7D32');
        }
        
        // ボール本体
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // ハイライト
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 結果表示
    showResult() {
        // CPU思考フラグをリセット
        this.cpuThinking = false;
        
        // 方向ボタンを削除
        this.removeDirectionButtons();
        
        setTimeout(() => {
            const resultScreen = document.getElementById('resultScreen');
            const resultTitle = document.getElementById('resultTitle');
            const resultMessage = document.getElementById('resultMessage');
            
            if (this.winner === 0) {
                resultTitle.textContent = '🤝 引き分け！';
                resultMessage.textContent = '素晴らしいゲームでした！';
            } else {
                resultTitle.textContent = '🎉 勝利！';
                if (this.gameMode === 'pvc') {
                    resultMessage.textContent = this.winner === 1 ? 'あなたの勝利です！' : 'CPUの勝利です！';
                } else {
                    resultMessage.textContent = `プレイヤー${this.winner}の勝利です！`;
                }
            }
            
            // 最終盤面を描画
            this.drawFinalBoard();
            
            document.getElementById('gameScreen').classList.add('hidden');
            resultScreen.classList.remove('hidden');
        }, 1000);
    }

    // 最終盤面描画（余白調整版）
    drawFinalBoard() {
        const canvas = document.getElementById('finalBoardCanvas');
        const ctx = canvas.getContext('2d');
        const cellSize = 40; // 小さくして余白を調整
        
        // キャンバスサイズに基づいて盤面を中央に配置
        const boardSize = cellSize * 6;
        const boardOffset = { 
            x: (canvas.width - boardSize) / 2, 
            y: (canvas.height - boardSize) / 2 
        };
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // ボード描画
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(boardOffset.x, boardOffset.y, cellSize * 6, cellSize * 6);
        
        // グリッド
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 6; i++) {
            ctx.beginPath();
            ctx.moveTo(boardOffset.x + i * cellSize, boardOffset.y);
            ctx.lineTo(boardOffset.x + i * cellSize, boardOffset.y + cellSize * 6);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(boardOffset.x, boardOffset.y + i * cellSize);
            ctx.lineTo(boardOffset.x + cellSize * 6, boardOffset.y + i * cellSize);
            ctx.stroke();
        }
        
        // ボール描画
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.board[row][col] !== 0) {
                    const x = boardOffset.x + col * cellSize + cellSize / 2;
                    const y = boardOffset.y + row * cellSize + cellSize / 2;
                    const radius = cellSize * 0.3;
                    
                    const gradient = ctx.createRadialGradient(
                        x - radius * 0.3, y - radius * 0.3, 0,
                        x, y, radius
                    );
                    
                    if (this.board[row][col] === 1) {
                        gradient.addColorStop(0, '#FF8A80');
                        gradient.addColorStop(1, '#D32F2F');
                    } else {
                        gradient.addColorStop(0, '#A5D6A7');
                        gradient.addColorStop(1, '#2E7D32');
                    }
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // CPU移動（修正版）
    cpuMove() {
        if (this.animating || this.gameOver) return;
        
        const move = this.findBestMove();
        if (move) {
            if (move.needsDirection) {
                this.pushBalls(move.row, move.col, move.direction);
            } else {
                this.placeBall(move.row, move.col, 2);
            }
        }
    }

    // CPUの最適手を探索
    findBestMove() {
        const moves = this.getAllPossibleMoves(2);
        let bestMove = null;
        let bestScore = -Infinity;
        
        for (const move of moves) {
            const score = this.evaluateMove(move, 2);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        
        return bestMove;
    }

    // 全ての可能な手を取得（修正版）
    getAllPossibleMoves(player) {
        const moves = [];
        
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.isEdgePosition(row, col)) {
                    if (this.board[row][col] === 0) {
                        // 空の場合
                        moves.push({ row, col, needsDirection: false });
                    } else {
                        // ボールがある場合、可能な方向のみを試す
                        const directions = this.getAvailableDirections(row, col);
                        for (const direction of directions) {
                            if (this.canPushInDirection(row, col, direction)) {
                                moves.push({ row, col, direction, needsDirection: true });
                            }
                        }
                    }
                }
            }
        }
        
        return moves;
    }

    // 手の評価
    evaluateMove(move, player) {
        // 仮想的にボードをコピーして手を実行
        const originalBoard = this.board.map(row => [...row]);
        
        if (move.needsDirection) {
            this.simulatePush(move.row, move.col, move.direction);
        }
        this.board[move.row][move.col] = player;
        
        let score = 0;
        
        // 勝利チェック
        if (this.checkWinForPlayer(player)) {
            score = 1000;
        }
        // 相手の勝利阻止
        else if (this.checkWinForPlayer(3 - player)) {
            score = -1000;
        }
        // 戦略的評価
        else {
            score = this.evaluatePosition(player);
        }
        
        // ボードを元に戻す
        this.board = originalBoard;
        
        return score;
    }

    // 押し出しをシミュレート
    simulatePush(startRow, startCol, direction) {
        const [dRow, dCol] = this.getDirectionVector(direction);
        const ballsToMove = [];
        
        let currentRow = startRow;
        let currentCol = startCol;
        
        while (currentRow >= 0 && currentRow < 6 && currentCol >= 0 && currentCol < 6 && 
               this.board[currentRow][currentCol] !== 0) {
            ballsToMove.push({
                row: currentRow,
                col: currentCol,
                player: this.board[currentRow][currentCol]
            });
            currentRow += dRow;
            currentCol += dCol;
        }
        
        // ボードの状態を更新
        ballsToMove.forEach(ball => {
            this.board[ball.row][ball.col] = 0;
        });
        
        ballsToMove.forEach(ball => {
            const newRow = ball.row + dRow;
            const newCol = ball.col + dCol;
            if (newRow >= 0 && newRow < 6 && newCol >= 0 && newCol < 6) {
                this.board[newRow][newCol] = ball.player;
            }
        });
    }

    // プレイヤーの勝利チェック
    checkWinForPlayer(player) {
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.board[row][col] === player) {
                    if ((col <= 1 && this.checkLine(row, col, 0, 1, player)) ||
                        (row <= 1 && this.checkLine(row, col, 1, 0, player)) ||
                        (row <= 1 && col <= 1 && this.checkLine(row, col, 1, 1, player)) ||
                        (row <= 1 && col >= 4 && this.checkLine(row, col, 1, -1, player))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // 位置の戦略的評価
    evaluatePosition(player) {
        let score = 0;
        
        // 連続したボールの数をカウント
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                if (this.board[row][col] === player) {
                    score += this.countConsecutive(row, col, player);
                }
            }
        }
        
        return score;
    }

    // 連続したボールの数をカウント
    countConsecutive(row, col, player) {
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
        let totalScore = 0;
        
        for (const [dRow, dCol] of directions) {
            let count = 1;
            
            // 正方向
            let r = row + dRow, c = col + dCol;
            while (r >= 0 && r < 6 && c >= 0 && c < 6 && this.board[r][c] === player) {
                count++;
                r += dRow;
                c += dCol;
            }
            
            // 逆方向
            r = row - dRow;
            c = col - dCol;
            while (r >= 0 && r < 6 && c >= 0 && c < 6 && this.board[r][c] === player) {
                count++;
                r -= dRow;
                c -= dCol;
            }
            
            if (count >= 2) {
                totalScore += Math.pow(count, 2);
            }
        }
        
        return totalScore;
    }

    // ゲームリセット（完全版）
    reset() {
        console.log('ゲームリセット開始'); // デバッグ用
        
        // 全ての状態を完全にリセット
        this.board = Array(6).fill().map(() => Array(6).fill(0));
        this.currentPlayer = 1;
        this.gameOver = false;
        this.winner = null;
        this.animating = false;
        this.cpuThinking = false; // CPU思考フラグもリセット
        this.selectedPosition = null;
        this.availableDirections = [];
        this.showingArrows = false;
        
        // HTMLボタンを削除
        this.removeDirectionButtons();
        
        // モーダルを閉じる
        const modal = document.getElementById('directionModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        
        // キャンバスを完全にクリア（複数回実行）
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
        
        // 表示を更新
        this.updatePlayerDisplay();
        this.drawBoard();
        
        console.log('ゲームリセット完了'); // デバッグ用
    }
}

// ゲームインスタンス
let game = null;

// 完全リセット関数
function completeReset() {
    console.log('完全リセット実行'); // デバッグ用
    
    // 既存のゲームを完全に破棄
    if (game) {
        game.removeDirectionButtons(); // HTMLボタンを削除
        game.reset();
        game = null;
    }
    
    // 全ての方向ボタンを削除（念のため）
    const directionBtns = document.querySelectorAll('.direction-btn');
    directionBtns.forEach(btn => {
        if (btn && btn.parentNode) {
            btn.parentNode.removeChild(btn);
        }
    });
    
    // 全てのキャンバスを手動でクリア
    const canvases = ['gameCanvas', 'finalBoardCanvas'];
    canvases.forEach(canvasId => {
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
    });
    
    // モーダルを閉じる
    const modal = document.getElementById('directionModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    
    // 結果画面の要素をリセット
    const resultTitle = document.getElementById('resultTitle');
    const resultMessage = document.getElementById('resultMessage');
    if (resultTitle) resultTitle.textContent = '';
    if (resultMessage) resultMessage.textContent = '';
}

// メニュー関数（完全リセット版）
function startPlayerVsPlayer() {
    console.log('PvP開始'); // デバッグ用
    completeReset(); // 完全リセット実行
    
    // 新しいゲームインスタンスを作成
    game = new PentarollGame();
    game.gameMode = 'pvp';
    document.getElementById('player2Name').textContent = 'プレイヤー2';
    showScreen('gameScreen');
}

function startPlayerVsCPU() {
    console.log('PvC開始'); // デバッグ用
    completeReset(); // 完全リセット実行
    
    // 新しいゲームインスタンスを作成
    game = new PentarollGame();
    game.gameMode = 'pvc';
    document.getElementById('player2Name').textContent = 'CPU';
    showScreen('gameScreen');
}

function showRules() {
    showScreen('rulesScreen');
}

function backToMenu() {
    console.log('メニューに戻る'); // デバッグ用
    completeReset(); // 完全リセット実行
    showScreen('mainMenu');
}

function restartGame() {
    console.log('ゲーム再開始'); // デバッグ用
    if (game) {
        const currentGameMode = game.gameMode;
        completeReset(); // 完全リセット実行
        
        // 新しいゲームを開始
        game = new PentarollGame();
        game.gameMode = currentGameMode;
        
        // プレイヤー名を設定
        if (currentGameMode === 'pvc') {
            document.getElementById('player2Name').textContent = 'CPU';
        } else {
            document.getElementById('player2Name').textContent = 'プレイヤー2';
        }
        
        showScreen('gameScreen');
    }
}

function cancelMove() {
    const modal = document.getElementById('directionModal');
    modal.classList.add('hidden');
    if (game) {
        game.hideDirectionButtons();
    }
}

function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    showScreen('mainMenu');
}); 