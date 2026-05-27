import React from "react";

/** Hai gấu đọc sách — dùng trên màn hình chủ & làm nguồn icon app */
export default function PandaBrandIcon({
  className = "w-16 h-16",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="17" cy="28" r="5.5" fill="#000000" />
      <circle cx="37" cy="28" r="5.5" fill="#000000" />
      <circle cx="43" cy="28" r="5.5" fill="#000000" />
      <circle cx="63" cy="28" r="5.5" fill="#000000" />
      <circle cx="27" cy="38" r="13" fill="#FFFFFF" />
      <circle cx="53" cy="38" r="13" fill="#FFFFFF" />
      <ellipse cx="22" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(-15 22 37)" />
      <ellipse cx="32" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(15 32 37)" />
      <circle cx="23" cy="36" r="1.2" fill="#FFFFFF" />
      <circle cx="31" cy="36" r="1.2" fill="#FFFFFF" />
      <ellipse cx="27" cy="42" rx="1.8" ry="1.2" fill="#000000" />
      <circle cx="18" cy="42" r="2" fill="#FF8D9E" fillOpacity="0.6" />
      <circle cx="36" cy="42" r="2" fill="#FF8D9E" fillOpacity="0.6" />
      <circle cx="13" cy="23" r="1.6" fill="#F472B6" />
      <path d="M13 23 L9 20 L9 26 Z" fill="#F43F5E" />
      <path d="M13 23 L17 20 L17 26 Z" fill="#F43F5E" />
      <ellipse cx="48" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(-15 48 37)" />
      <ellipse cx="58" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(15 58 37)" />
      <circle cx="49" cy="36" r="1.2" fill="#FFFFFF" />
      <circle cx="57" cy="36" r="1.2" fill="#FFFFFF" />
      <ellipse cx="53" cy="42" rx="1.8" ry="1.2" fill="#000000" />
      <circle cx="14" cy="52" r="4.5" fill="#000000" />
      <circle cx="66" cy="52" r="4.5" fill="#000000" />
      <rect x="22" y="47" width="36" height="22" rx="3" fill="#E67E22" stroke="#FFFFFF" strokeWidth="1.2" />
      <text
        x="40"
        y="58"
        fill="#FFFFFF"
        fontSize="8"
        fontWeight="900"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="sans-serif"
        letterSpacing="0.5"
      >
        小说
      </text>
      <circle cx="25" cy="54" r="4" fill="#000000" />
      <circle cx="55" cy="54" r="4" fill="#000000" />
    </svg>
  );
}
