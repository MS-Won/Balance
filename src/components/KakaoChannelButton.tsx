import { buildKakaoChannelUrl } from "@/lib/kakaoChannel";

export function KakaoChannelButton() {
  const channelId = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_ID;
  if (!channelId) return null;

  return (
    <a
      className="share channel"
      href={buildKakaoChannelUrl(channelId)}
      target="_blank"
      rel="noopener noreferrer"
    >
      채널 추가하고 매일 알림받기
    </a>
  );
}
