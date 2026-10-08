/** Chú mèo cầm đồng hồ báo thức — chỉ dùng SVG + CSS animation (xem .cat-* trong index.css) */
export function CuteCat({ size = 150 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className="cat-bob overflow-visible">
      {/* bóng */}
      <ellipse cx="100" cy="186" rx="52" ry="8" fill="currentColor" opacity="0.08" className="cat-shadow" />

      {/* đuôi */}
      <g className="cat-tail" style={{ transformOrigin: '138px 160px' }}>
        <path d="M138 162 C 172 160, 182 132, 168 112 C 162 104, 152 108, 158 118 C 166 132, 156 148, 134 150" fill="#f4a95c" />
        <path d="M168 112 C 162 104, 152 108, 158 118" fill="#fbe3c4" />
      </g>

      {/* thân */}
      <ellipse cx="100" cy="148" rx="46" ry="38" fill="#f4a95c" />
      <ellipse cx="100" cy="156" rx="28" ry="26" fill="#fbe3c4" />

      {/* đồng hồ báo thức */}
      <g className="cat-clock" style={{ transformOrigin: '100px 150px' }}>
        <circle cx="86" cy="128" r="6" fill="#e05d5d" />
        <circle cx="114" cy="128" r="6" fill="#e05d5d" />
        <circle cx="100" cy="150" r="21" fill="#e05d5d" />
        <circle cx="100" cy="150" r="16" fill="#fff" />
        <line x1="100" y1="150" x2="100" y2="140" stroke="#334" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="100" y1="150" x2="108" y2="153" stroke="#334" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="100" cy="150" r="2" fill="#334" />
      </g>

      {/* chân trước ôm đồng hồ */}
      <ellipse cx="78" cy="160" rx="10" ry="8" fill="#fbe3c4" />
      <ellipse cx="122" cy="160" rx="10" ry="8" fill="#fbe3c4" />

      {/* đầu */}
      <g className="cat-head" style={{ transformOrigin: '100px 100px' }}>
        {/* tai */}
        <g className="cat-ear-l" style={{ transformOrigin: '66px 62px' }}>
          <path d="M56 78 L 60 30 L 92 58 Z" fill="#f4a95c" />
          <path d="M63 70 L 65 42 L 84 58 Z" fill="#f7b7c3" />
        </g>
        <g className="cat-ear-r" style={{ transformOrigin: '134px 62px' }}>
          <path d="M144 78 L 140 30 L 108 58 Z" fill="#f4a95c" />
          <path d="M137 70 L 135 42 L 116 58 Z" fill="#f7b7c3" />
        </g>
        <ellipse cx="100" cy="88" rx="50" ry="42" fill="#f4a95c" />
        {/* vằn trán */}
        <path d="M92 50 Q 100 62 108 50" stroke="#e58e3c" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M86 54 Q 92 64 94 56" stroke="#e58e3c" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M114 54 Q 108 64 106 56" stroke="#e58e3c" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* mõm */}
        <ellipse cx="100" cy="104" rx="24" ry="17" fill="#fbe3c4" />
        {/* mắt */}
        <g className="cat-eyes" style={{ transformOrigin: '100px 88px' }}>
          <ellipse cx="80" cy="88" rx="7" ry="9" fill="#2b2b3a" />
          <ellipse cx="120" cy="88" rx="7" ry="9" fill="#2b2b3a" />
          <circle cx="82.5" cy="84.5" r="2.6" fill="#fff" />
          <circle cx="122.5" cy="84.5" r="2.6" fill="#fff" />
        </g>
        {/* má hồng */}
        <ellipse cx="68" cy="104" rx="8" ry="5" fill="#f7a1b0" opacity="0.7" />
        <ellipse cx="132" cy="104" rx="8" ry="5" fill="#f7a1b0" opacity="0.7" />
        {/* mũi + miệng */}
        <path d="M96 98 L 104 98 L 100 103 Z" fill="#e5788b" />
        <path d="M100 103 Q 100 109 94 110 M100 103 Q 100 109 106 110" stroke="#2b2b3a" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* ria */}
        <g stroke="#c98a4e" strokeWidth="1.6" strokeLinecap="round">
          <line x1="74" y1="102" x2="50" y2="98" />
          <line x1="74" y1="106" x2="50" y2="108" />
          <line x1="126" y1="102" x2="150" y2="98" />
          <line x1="126" y1="106" x2="150" y2="108" />
        </g>
      </g>

      {/* sóng chuông */}
      <g className="cat-rings" stroke="#e05d5d" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M64 136 Q 58 142 62 150" />
        <path d="M136 136 Q 142 142 138 150" />
      </g>
    </svg>
  );
}
