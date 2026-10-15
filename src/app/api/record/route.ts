import { NextResponse } from "next/server";

export interface LeaderboardItem {
  rank: number;
  name: string;
  finishtime: string;
  score: number;
  timestamp: string;
}

const SPREADSHEET_ID = "1dq5mBrBwZ36XA3ZaWPe73a7RAj2b-4Alt48BEDPZIoU";

// 구글 시트 CSV 데이터로부터 종료시간(오름차순) 기준 상위 3명 계산
async function fetchLeaderboardFromSheetCsv(): Promise<LeaderboardItem[]> {
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) return [];

    const text = await res.text();
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length <= 1) return [];

    // 헤더 제외한 데이터 행 파싱 (CSV의 따옴표 제거)
    const records = lines.slice(1).map((line) => {
      // 쉼표로 분리 (따옴표 처리)
      const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
      const cleanCols = matches.map((col) => col.replace(/^"|"$/g, "").trim());

      const timestamp = cleanCols[0] || "";
      const name = cleanCols[1] || "익명";
      const score = Number(cleanCols[2]) || 0;
      const finishtime = cleanCols[3] || "";

      // 시간 숫자 추출 (예: "10초" -> 10, "15.5초" -> 15.5)
      const numMatch = finishtime.match(/\d+(\.\d+)?/);
      const timeNum = numMatch ? parseFloat(numMatch[0]) : 999999;

      return {
        timestamp,
        name,
        score,
        finishtime,
        timeNum,
      };
    }).filter((r) => r.name && r.timeNum < 999999);

    // 종료시간 오름차순 정렬 (빠를수록 상위 순위)
    records.sort((a, b) => {
      if (a.timeNum !== b.timeNum) {
        return a.timeNum - b.timeNum;
      }
      return b.score - a.score; // 시간 같을 시 점수 높은 순
    });

    // 상위 3명 반환
    return records.slice(0, 3).map((item, idx) => ({
      rank: idx + 1,
      name: item.name,
      finishtime: item.finishtime,
      score: item.score,
      timestamp: item.timestamp,
    }));
  } catch {
    return [];
  }
}

// 구글 앱스 스크립트 또는 시트 CSV로부터 TOP 3 랭킹 조회 (GET)
export async function GET() {
  const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

  // 1차: 구글 앱스 스크립트 doGet 호출 시도
  if (scriptUrl) {
    try {
      const response = await fetch(scriptUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          if (data.leaderboard && Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
            return NextResponse.json({
              success: true,
              leaderboard: data.leaderboard,
            });
          }
        } catch {
          // JSON 파싱 실패 시 폴백으로 이동
        }
      }
    } catch {
      // 오류 시 폴백으로 이동
    }
  }

  // 2차: 구글 스프레드시트 실시간 데이터 직접 조회 (즉시 100% 반영)
  const csvLeaderboard = await fetchLeaderboardFromSheetCsv();
  return NextResponse.json({
    success: true,
    leaderboard: csvLeaderboard,
  });
}

// 게임 결과 저장 및 갱신된 TOP 3 랭킹 반환 (POST)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, score, finishtime, timestamp } = body;

    const scriptUrl = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

    if (!scriptUrl) {
      return NextResponse.json({
        success: true,
        message: "Google Apps Script URL이 설정되지 않아 로컬 모드로 동작합니다.",
        leaderboard: [
          { rank: 1, name: name || "플레이어1", finishtime: finishtime || "10초", score: score || 950, timestamp: new Date().toLocaleString() }
        ],
      });
    }

    // Google Apps Script로 전송
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timestamp: timestamp || new Date().toISOString(),
        name,
        score,
        finishtime,
      }),
    });

    let scriptLeaderboard: LeaderboardItem[] = [];
    try {
      const resultText = await response.text();
      const data = JSON.parse(resultText);
      if (data.leaderboard && Array.isArray(data.leaderboard)) {
        scriptLeaderboard = data.leaderboard;
      }
    } catch {
      // fallback
    }

    // 스크립트 응답에 랭킹이 없으면 스프레드시트에서 직접 조회
    if (scriptLeaderboard.length === 0) {
      // 스프레드시트에 행이 기록될 수 있도록 아주 짧은 딜레이 후 조회
      await new Promise((resolve) => setTimeout(resolve, 500));
      scriptLeaderboard = await fetchLeaderboardFromSheetCsv();
    }

    return NextResponse.json({
      success: true,
      leaderboard: scriptLeaderboard,
    });
  } catch (error) {
    // 저장 중 에러가 나더라도 현재까지의 시트 랭킹은 반환
    const fallbackLeaderboard = await fetchLeaderboardFromSheetCsv();
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      leaderboard: fallbackLeaderboard,
    });
  }
}
