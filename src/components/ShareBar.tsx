"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (settings: {
          objectType: "feed";
          content: {
            title: string;
            description: string;
            imageUrl: string;
            link: { webUrl: string; mobileWebUrl: string };
          };
        }) => void;
      };
    };
  }
}

export function ShareBar({ question }: { question: string | null }) {
  const [copied, setCopied] = useState(false);
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  function shareKakao() {
    if (!window.Kakao?.isInitialized()) {
      alert("카카오톡 공유 준비 중이에요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const url = window.location.href;
    window.Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: "오늘의 밸런스",
        description: question ?? "오늘의 밸런스 게임에 참여해보세요",
        imageUrl: new URL("/opengraph-image", url).toString(),
        link: { webUrl: url, mobileWebUrl: url },
      },
    });
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="sharebar">
      {kakaoKey && (
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.8.1/kakao.min.js"
          onLoad={() => {
            if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(kakaoKey);
          }}
        />
      )}
      <button type="button" className="share kakao" onClick={shareKakao}>
        카카오톡 공유
      </button>
      <button type="button" className="share copy" onClick={copyUrl}>
        {copied ? "복사됨!" : "URL 복사"}
      </button>
    </div>
  );
}
