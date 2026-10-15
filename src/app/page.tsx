"use client";

import { useState, useEffect, useCallback } from "react";

interface Card {
  id: number;
  fruit: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export interface LeaderboardItem {
  rank: number;
  name: string;
  finishtime: string;
  score: number;
  timestamp: string;
}

const FRUITS = ["🍎", "🍌", "🍇", "🍊", "🍉", "🍓", "🍑", "🍍"];

export default function CardMatchingGame() {
  // 테마 상태: 'light' | 'dark'
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // 화면 상태: 'welcome' | 'playing' | 'result'
  const [screen, setScreen] = useState<"welcome" | "playing" | "result">("welcome");
  const [username, setUsername] = useState("");
  const [inputError, setInputError] = useState("");

  // 게임 플레이 상태
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [moves, setMoves] = useState(0);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [finalScore, setFinalScore] = useState<number>(0);

  // 구글 시트 저장 및 TOP 3 랭킹 상태
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [showRankModal, setShowRankModal] = useState(false);

  // .env.local의 NEXT_PUBLIC_GOOGLE_SCRIPT_URL 환경변수 확인
  const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

  // 랭킹 데이터 불러오기 함수
  const fetchLeaderboard = useCallback(async () => {
    setIsLoadingLeaderboard(true);
    try {
      const res = await fetch("/api/record", { method: "GET" });
      const data = await res.json();
      if (data.success && Array.isArray(data.leaderboard)) {
        setLeaderboard(data.leaderboard);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, []);

  // 테마 및 초기 데이터 설정
  useEffect(() => {
    const savedTheme = localStorage.getItem("game_theme") as "light" | "dark" | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
    
    setTheme(initialTheme);
    if (initialTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    const savedBest = localStorage.getItem("card_game_best_time");
    if (savedBest) {
      setBestTime(Number(savedBest));
    }

    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // 테마 전환
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("game_theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // 타이머 핸들러
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (screen === "playing" && !isPaused) {
      interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [screen, isPaused]);

  // 카드 덱 초기화
  const initializeGame = () => {
    const deck: Card[] = [...FRUITS, ...FRUITS]
      .sort(() => Math.random() - 0.5)
      .map((fruit, index) => ({
        id: index,
        fruit,
        isFlipped: false,
        isMatched: false,
      }));

    setCards(deck);
    setFlippedCards([]);
    setMatchedPairs(0);
    setSeconds(0);
    setMoves(0);
    setFinalScore(0);
    setIsLocked(false);
    setIsPaused(false);
    setIsNewRecord(false);
    setSaveStatus("idle");
    setSaveMessage("");
  };

  // 게임 시작
  const handleStartGame = () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setInputError("이름을 입력해주세요!");
      return;
    }
    setInputError("");
    initializeGame();
    setScreen("playing");
  };

  // 구글 시트 저장 및 TOP 3 랭킹 갱신 (성공 시에만 실행)
  const saveGameRecord = async (playerName: string, clearTime: number, totalMoves: number, calculatedScore: number) => {
    setSaveStatus("saving");
    setSaveMessage("구글 시트에 기록 저장 및 순위 집계 중...");

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
      2,
      "0"
    )}:${String(now.getSeconds()).padStart(2, "0")}`;

    const recordData = {
      timestamp,
      name: playerName,
      score: calculatedScore,
      finishtime: `${clearTime}초`,
    };

    try {
      // 1. Next.js 서버 라우트(/api/record)를 통해 구글 앱스 스크립트 실행
      const res = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recordData),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setSaveStatus("saved");
        setSaveMessage("구글 시트에 성공 기록이 저장되었습니다! 📊");
        
        // 반환된 TOP 3 랭킹 데이터가 있으면 즉시 반영
        if (result.leaderboard && result.leaderboard.length > 0) {
          setLeaderboard(result.leaderboard);
        } else {
          fetchLeaderboard();
        }
        return;
      }
      throw new Error(result.error || "서버 라우트 오류");
    } catch {
      // 2. 직접 클라이언트에서 전송 시도
      if (scriptUrl) {
        try {
          await fetch(scriptUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(recordData),
          });
          setSaveStatus("saved");
          setSaveMessage("구글 시트에 성공 기록이 저장되었습니다! 📊");
          fetchLeaderboard();
          return;
        } catch {
          // fallback failed
        }
      }
      setSaveStatus("failed");
      setSaveMessage("구글 시트 저장에 실패했습니다.");
    }
  };

  // 게임 성공/클리어 처리
  const handleGameClear = (currentSeconds: number, currentMoves: number) => {
    const calculatedScore = Math.max(100, 1000 - (currentSeconds * 10 + currentMoves * 5));
    setFinalScore(calculatedScore);

    setTimeout(() => {
      setScreen("result");
      setBestTime((prevBest) => {
        if (prevBest === null || currentSeconds < prevBest) {
          localStorage.setItem("card_game_best_time", String(currentSeconds));
          setIsNewRecord(true);
          return currentSeconds;
        }
        return prevBest;
      });

      // 구글 앱스 스크립트 실행하여 완료 데이터 저장 및 TOP 3 랭킹 수신
      saveGameRecord(username, currentSeconds, currentMoves, calculatedScore);
    }, 500);
  };

  // 카드 클릭 이벤트
  const handleCardClick = (id: number) => {
    if (isLocked || isPaused) return;

    const targetCard = cards.find((c) => c.id === id);
    if (!targetCard || targetCard.isFlipped || targetCard.isMatched) return;

    const updatedCards = cards.map((c) =>
      c.id === id ? { ...c, isFlipped: true } : c
    );
    setCards(updatedCards);

    const newFlipped = [...flippedCards, id];
    setFlippedCards(newFlipped);

    // 2장 뒤집혔을 때 비교
    if (newFlipped.length === 2) {
      setIsLocked(true);
      const nextMoves = moves + 1;
      setMoves(nextMoves);

      const [firstId, secondId] = newFlipped;
      const firstCard = updatedCards.find((c) => c.id === firstId);
      const secondCard = updatedCards.find((c) => c.id === secondId);

      if (firstCard && secondCard && firstCard.fruit === secondCard.fruit) {
        // 일치한 경우
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === firstId || c.id === secondId
                ? { ...c, isMatched: true }
                : c
            )
          );
          setFlippedCards([]);
          setIsLocked(false);

          setMatchedPairs((prevMatched) => {
            const nextCount = prevMatched + 1;
            if (nextCount === FRUITS.length) {
              handleGameClear(seconds, nextMoves);
            }
            return nextCount;
          });
        }, 350);
      } else {
        // 불일치한 경우 다시 뒤집기
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === firstId || c.id === secondId
                ? { ...c, isFlipped: false }
                : c
            )
          );
          setFlippedCards([]);
          setIsLocked(false);
        }, 850);
      }
    }
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  // 중도 포기/다시 시작 (구글 시트에 저장되지 않음)
  const handleRestart = () => {
    if (confirm("게임을 처음부터 다시 시작하시겠습니까? (현재 진행 중인 기록은 저장되지 않습니다)")) {
      initializeGame();
    }
  };

  // 중도 포기/처음으로 (구글 시트에 저장되지 않음)
  const handleHome = () => {
    setScreen("welcome");
  };

  // 메달 아이콘 헬퍼
  const getRankBadge = (rank: number) => {
    if (rank === 1) return { icon: "🥇", label: "1위", color: "from-amber-400 to-yellow-500 text-amber-950 border-amber-300" };
    if (rank === 2) return { icon: "🥈", label: "2위", color: "from-slate-300 to-slate-400 text-slate-900 border-slate-300" };
    if (rank === 3) return { icon: "🥉", label: "3위", color: "from-amber-700/60 to-amber-800/80 text-amber-100 border-amber-600" };
    return { icon: `${rank}`, label: `${rank}위`, color: "from-slate-200 to-slate-300 text-slate-700 border-slate-200" };
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between p-4 sm:p-6 overflow-hidden bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] dark:from-[#090d16] dark:via-[#0f172a] dark:to-[#020617] text-slate-800 dark:text-slate-100 transition-colors duration-500 font-sans select-none">
      
      {/* 배경 오로라 블러 장식 */}
      <div className="absolute -top-32 -left-32 w-80 sm:w-96 h-80 sm:h-96 rounded-full bg-teal-200/40 dark:bg-teal-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 -right-32 w-80 sm:w-96 h-80 sm:h-96 rounded-full bg-rose-200/40 dark:bg-rose-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 left-1/3 w-80 sm:w-96 h-80 sm:h-96 rounded-full bg-indigo-200/40 dark:bg-indigo-500/10 blur-[100px] pointer-events-none" />

      {/* 상단 헤더: 테마 토글 및 랭킹 모달 버튼 */}
      <header className="w-full max-w-[440px] flex items-center justify-between pt-1 pb-3 z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-xl">✨</span>
          <span className="text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
            Memory Card Game
          </span>
          {scriptUrl && (
            <span
              title="Google Apps Script 연동 활성화됨"
              className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            >
              ● Sheets
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {screen === "welcome" && (
            <button
              onClick={() => {
                fetchLeaderboard();
                setShowRankModal(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-xs font-medium cursor-pointer transition active:scale-95 backdrop-blur-sm"
              title="TOP 3 순위 보기"
            >
              <span>🏆 랭킹</span>
            </button>
          )}

          <button
            onClick={toggleTheme}
            aria-label={theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"}
            className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/40 dark:bg-white/10 backdrop-blur-md border border-white/60 dark:border-white/10 shadow-sm hover:bg-white/70 dark:hover:bg-white/15 active:scale-95 transition-all duration-200 text-xs font-medium cursor-pointer"
          >
            <span>{theme === "light" ? "🌙 다크모드" : "☀️ 라이트모드"}</span>
          </button>
        </div>
      </header>

      {/* 중앙 메인 글래스 카드 컨테이너 */}
      <div className="w-full max-w-[440px] my-auto z-10">
        <main className="relative w-full rounded-3xl bg-white/50 dark:bg-slate-900/40 backdrop-blur-xl border border-white/70 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] p-5 sm:p-7 text-center transition-all duration-300">
          
          {/* 1단계: 시작 화면 */}
          {screen === "welcome" && (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-md border border-white/80 dark:border-white/15 text-3xl flex items-center justify-center mb-4 shadow-sm">
                🃏
              </div>
              
              <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">
                카드 맞추기 게임
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 font-normal">
                카드를 뒤집어 같은 짝을 모두 맞춰보세요!
              </p>

              <div className="w-full mb-4 text-left">
                <label
                  htmlFor="player-name"
                  className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 pl-1"
                >
                  플레이어 이름
                </label>
                <input
                  id="player-name"
                  type="text"
                  placeholder="이름을 입력하세요 (최대 10자)"
                  maxLength={10}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (inputError) setInputError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleStartGame();
                  }}
                  className="w-full px-4 py-3 text-sm sm:text-base bg-white/60 dark:bg-slate-950/40 backdrop-blur-md border border-white/80 dark:border-white/15 rounded-2xl outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-400 dark:focus:border-teal-400 focus:ring-4 focus:ring-teal-400/20 text-slate-900 dark:text-white"
                  autoFocus
                />
                {inputError && (
                  <p className="text-xs text-rose-500 dark:text-rose-400 mt-1.5 pl-1 font-medium">
                    {inputError}
                  </p>
                )}
              </div>

              {bestTime !== null && (
                <div className="w-full py-2.5 px-3.5 mb-5 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 text-xs font-medium text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1.5 backdrop-blur-sm">
                  <span>🏆</span>
                  <span>내 최고 기록: <strong>{bestTime}초</strong></span>
                </div>
              )}

              <button
                onClick={handleStartGame}
                className="w-full py-3.5 px-6 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 active:scale-[0.98] text-white font-bold rounded-2xl shadow-lg shadow-teal-500/20 transition-all text-sm sm:text-base cursor-pointer"
              >
                게임 시작
              </button>
            </div>
          )}

          {/* 2단계: 게임 플레이 화면 */}
          {screen === "playing" && (
            <div>
              {/* 상단 정보 바 */}
              <div className="grid grid-cols-4 gap-1.5 bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-2xl p-2.5 mb-3.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <div className="flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">플레이어</span>
                  <span className="truncate max-w-full font-bold text-slate-800 dark:text-slate-200">{username}</span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">시간</span>
                  <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">{seconds}초</span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">맞춘 쌍</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{matchedPairs}/{FRUITS.length}</span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">시도</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{moves}회</span>
                </div>
              </div>

              {/* 카드 그리드 영역 */}
              <div className="relative">
                {isPaused && (
                  <div className="absolute inset-0 z-30 backdrop-blur-md bg-white/70 dark:bg-slate-900/80 rounded-2xl flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200">
                    <span className="text-4xl animate-pulse">⏸️</span>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                      게임이 일시 정지되었습니다
                    </p>
                    <button
                      onClick={togglePause}
                      className="py-2.5 px-6 bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition active:scale-95"
                    >
                      이어하기
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 sm:gap-2.5 mb-4">
                  {cards.map((card) => {
                    const isOpen = card.isFlipped || card.isMatched;
                    return (
                      <button
                        key={card.id}
                        onClick={() => handleCardClick(card.id)}
                        disabled={isOpen || isLocked || isPaused}
                        aria-label={isOpen ? card.fruit : "뒷면 카드"}
                        className={`aspect-square rounded-2xl flex items-center justify-center select-none cursor-pointer transition-all duration-300 ${
                          isOpen
                            ? card.isMatched
                              ? "bg-emerald-500/15 dark:bg-emerald-500/20 border-2 border-emerald-400/80 dark:border-emerald-400 shadow-sm scale-95"
                              : "bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border-2 border-teal-400 shadow-md scale-100"
                            : "bg-white/35 dark:bg-white/5 backdrop-blur-md border border-white/70 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] hover:bg-white/55 dark:hover:bg-white/10 hover:border-white/90 active:scale-95 hover:shadow-md"
                        }`}
                      >
                        {isOpen ? (
                          <span className="text-2xl sm:text-3xl animate-in zoom-in-75 duration-200">
                            {card.fruit}
                          </span>
                        ) : (
                          <span className="text-slate-400/70 dark:text-slate-500 text-sm sm:text-base font-extrabold">
                            ?
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 하단 컨트롤 버튼 */}
              <div className="flex gap-2">
                <button
                  onClick={togglePause}
                  className={`flex-1 py-2.5 px-3 font-bold text-xs sm:text-sm rounded-xl text-white transition active:scale-[0.98] cursor-pointer shadow-sm ${
                    isPaused
                      ? "bg-teal-500 hover:bg-teal-600"
                      : "bg-amber-500/90 hover:bg-amber-600"
                  }`}
                >
                  {isPaused ? "이어하기" : "게임 중지"}
                </button>
                <button
                  onClick={handleRestart}
                  className="flex-1 py-2.5 px-3 font-bold text-xs sm:text-sm rounded-xl text-slate-700 dark:text-slate-200 bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 border border-white/70 dark:border-white/10 transition active:scale-[0.98] cursor-pointer shadow-sm backdrop-blur-md"
                >
                  다시 시작
                </button>
              </div>
            </div>
          )}

          {/* 3단계: 결과 화면 */}
          {screen === "result" && (
            <div className="flex flex-col items-center py-1 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-14 h-14 rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-md border border-white/80 dark:border-white/15 text-3xl flex items-center justify-center mb-2.5 shadow-sm animate-bounce">
                🎉
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-0.5">
                게임 완료!
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                축하합니다! 모든 카드의 짝을 찾았습니다!
              </p>

              {/* 내 게임 통계 박스 */}
              <div className="w-full bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-2xl p-3.5 mb-2.5 space-y-1.5 text-left text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">플레이어</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{username}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">종료시간 (finishtime)</span>
                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">{seconds}초</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">점수 (score)</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{finalScore}점</span>
                </div>
              </div>

              {/* 구글 시트 저장 알림 배지 */}
              <div className={`w-full py-1.5 px-3 rounded-xl mb-3 text-[11px] font-medium flex items-center justify-center gap-1.5 backdrop-blur-sm transition-all ${
                saveStatus === "saving"
                  ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-400/30"
                  : saveStatus === "saved"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40"
                  : saveStatus === "failed"
                  ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-400/30"
                  : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
              }`}>
                <span>{saveStatus === "saving" ? "⏳" : saveStatus === "saved" ? "✅" : "ℹ️"}</span>
                <span>{saveMessage || "구글 시트 연동 완료"}</span>
              </div>

              {/* 🏆 구글 시트 TOP 3 명예의 전당 (가장 빠른 순위) */}
              <div className="w-full bg-gradient-to-b from-amber-500/10 to-orange-500/5 dark:from-amber-400/10 dark:to-orange-400/5 border border-amber-400/30 rounded-2xl p-3.5 mb-3.5 text-left backdrop-blur-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <span>🏆</span>
                    <span>명예의 전당 TOP 3 (종료시간 순)</span>
                  </span>
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400 font-medium">
                    빠른 순 정렬
                  </span>
                </div>

                {isLoadingLeaderboard && leaderboard.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-3">랭킹 정보를 불러오는 중...</p>
                ) : leaderboard.length > 0 ? (
                  <div className="space-y-1.5">
                    {leaderboard.slice(0, 3).map((item) => {
                      const badge = getRankBadge(item.rank);
                      const isCurrentUser = item.name === username && item.finishtime === `${seconds}초`;
                      return (
                        <div
                          key={item.rank}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all ${
                            isCurrentUser
                              ? "bg-emerald-500/20 border border-emerald-500/40 font-bold"
                              : "bg-white/60 dark:bg-slate-900/40 border border-white/60 dark:border-white/10"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base select-none">{badge.icon}</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100 max-w-[100px] truncate">
                              {item.name}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500 text-white font-bold">
                                나
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-right">
                            <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                              ⏱️ {item.finishtime}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                              ({item.score}점)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-xs text-slate-400 py-2">
                    아직 등록된 랭킹 기록이 없습니다.
                  </p>
                )}
              </div>

              <div className="w-full flex gap-2">
                <button
                  onClick={initializeGame}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 active:scale-[0.98] text-white font-bold rounded-xl shadow-md transition cursor-pointer text-xs sm:text-sm"
                >
                  다시 도전
                </button>
                <button
                  onClick={handleHome}
                  className="flex-1 py-3 px-4 bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 border border-white/70 dark:border-white/10 active:scale-[0.98] text-slate-700 dark:text-slate-200 font-bold rounded-xl transition cursor-pointer text-xs sm:text-sm backdrop-blur-md"
                >
                  처음으로
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 랭킹 팝업 모달 (시작 화면에서 확인 가능) */}
      {showRankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-[380px] bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-white/80 dark:border-white/15 rounded-3xl p-5 shadow-2xl text-left animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🏆</span>
                <span>명예의 전당 TOP 3</span>
              </h3>
              <button
                onClick={() => setShowRankModal(false)}
                className="w-7 h-7 rounded-full bg-slate-200/60 dark:bg-white/10 flex items-center justify-center text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              구글 시트에 기록된 가장 빠른 종료시간 순위입니다.
            </p>

            {isLoadingLeaderboard ? (
              <p className="text-center text-xs text-slate-400 py-6">랭킹 불러오는 중...</p>
            ) : leaderboard.length > 0 ? (
              <div className="space-y-2 mb-4">
                {leaderboard.slice(0, 3).map((item) => {
                  const badge = getRankBadge(item.rank);
                  return (
                    <div
                      key={item.rank}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{badge.icon}</span>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100">{item.name}</div>
                          <div className="text-[10px] text-slate-400">{item.timestamp?.split(" ")[0]}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-teal-600 dark:text-teal-400">⏱️ {item.finishtime}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{item.score}점</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400 py-6">아직 기록된 랭킹이 없습니다.</p>
            )}

            <button
              onClick={() => setShowRankModal(false)}
              className="w-full py-2.5 bg-slate-800 dark:bg-white/10 text-white font-bold rounded-xl text-xs hover:bg-slate-700 cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 하단 카피라이트 */}
      <footer className="w-full max-w-[440px] pt-3 pb-2 text-center z-10">
        <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-medium tracking-tight">
          Copyright INU 카드 맞추기 게임 by hyeyeon min
        </p>
      </footer>
    </div>
  );
}
