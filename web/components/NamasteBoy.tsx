// A smiling boy in an orange football kit greeting with a namaste. Pure SVG and CSS, no image files; it stands still when the device has "reduce motion" on.
const SKIN = "#f2b48c";
const NAVY = "#0c0b5d";
const HAIR = "#2b1b17";

const css = `
.nb-bow{transform-origin:110px 150px;animation:nb-bow 3.6s ease-in-out infinite}
.nb-head{transform-origin:110px 92px;animation:nb-head 3.6s ease-in-out infinite}
.nb-eyes{transform-origin:110px 64px;animation:nb-blink 4.2s infinite}
.nb-bubble{animation:nb-pop 3.6s ease-in-out infinite;transform-origin:100% 100%}
.nb-hands{transform-origin:110px 124px;animation:nb-hands 3.6s ease-in-out infinite}
@keyframes nb-bow{0%,30%,100%{transform:rotate(0)}50%,70%{transform:rotate(5deg)}}
@keyframes nb-head{0%,30%,100%{transform:rotate(0)}50%,70%{transform:rotate(9deg)}}
@keyframes nb-hands{0%,30%,100%{transform:translateY(0)}50%,70%{transform:translateY(3px)}}
@keyframes nb-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes nb-pop{0%,8%{opacity:0;transform:scale(.85)}18%,82%{opacity:1;transform:scale(1)}94%,100%{opacity:0;transform:scale(.9)}}
@media (prefers-reduced-motion:reduce){.nb-bow,.nb-head,.nb-eyes,.nb-bubble,.nb-hands{animation:none!important}.nb-bubble{opacity:1}}
`;

export default function NamasteBoy({ className = "", bubble = true }: { className?: string; bubble?: boolean }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <style>{css}</style>
      <div className="flex items-end gap-1">
        <svg viewBox="60 14 100 144" className="h-44 w-auto sm:h-52" role="img" aria-label="A boy in a football kit saying namaste">
          <g className="nb-bow">
            <path d="M86 100 Q86 94 94 94 L126 94 Q134 94 134 100 L134 158 L86 158 Z" fill={NAVY} />
            <rect x={87} y={134} width={46} height={6} fill="#fff" opacity={0.9} />
            <path d="M100 94 Q110 108 120 94 Z" fill="#fff" />
            <rect x={102} y={88} width={16} height={12} fill={SKIN} />
            <g className="nb-head">
              <circle cx={77} cy={66} r={6} fill={SKIN} />
              <circle cx={143} cy={66} r={6} fill={SKIN} />
              <ellipse cx={110} cy={62} rx={33} ry={32} fill={SKIN} />
              <path d="M77 58 Q74 27 110 26 Q146 27 143 58 Q132 43 110 43 Q88 43 77 58 Z" fill={HAIR} />
              <path d="M102 29 Q108 12 121 27 Z" fill={HAIR} />
              <path d="M91 51 Q98 47 105 51 M115 51 Q122 47 129 51" stroke={HAIR} strokeWidth={2.5} fill="none" strokeLinecap="round" />
              <g className="nb-eyes">
                <ellipse cx={98} cy={64} rx={7} ry={8} fill="#fff" />
                <ellipse cx={122} cy={64} rx={7} ry={8} fill="#fff" />
                <circle cx={98.5} cy={65} r={4.6} fill={HAIR} />
                <circle cx={121.5} cy={65} r={4.6} fill={HAIR} />
                <circle cx={100.2} cy={63} r={1.7} fill="#fff" />
                <circle cx={123.2} cy={63} r={1.7} fill="#fff" />
              </g>
              <path d="M109 71 Q110 73.5 111 71" stroke="#c98a5c" strokeWidth={1.6} fill="none" strokeLinecap="round" />
              <circle cx={91} cy={76} r={5} fill="#fb7185" opacity={0.35} />
              <circle cx={129} cy={76} r={5} fill="#fb7185" opacity={0.35} />
              <path d="M95 76 Q110 96 125 76 Q110 81 95 76 Z" fill="#7f1d1d" />
              <path d="M98 77.5 Q110 83 122 77.5 L121 80.5 Q110 85 99 80.5 Z" fill="#fff" />
              <circle cx={110} cy={42} r={0} fill="none" />
            </g>
            <g className="nb-hands">
              <path d="M90 104 Q80 120 86 134" stroke={NAVY} strokeWidth={14} fill="none" strokeLinecap="round" />
              <path d="M130 104 Q140 120 134 134" stroke={NAVY} strokeWidth={14} fill="none" strokeLinecap="round" />
              <path d="M86 134 Q92 128 106 122" stroke={SKIN} strokeWidth={10} fill="none" strokeLinecap="round" />
              <path d="M134 134 Q128 128 114 122" stroke={SKIN} strokeWidth={10} fill="none" strokeLinecap="round" />
              <path d="M110 100 Q104 108 104 120 Q105 128 110 128 Q115 128 116 120 Q116 108 110 100 Z" fill={SKIN} stroke="#c98a5c" strokeWidth={1.4} />
              <path d="M110 104 V126" stroke="#c98a5c" strokeWidth={1.2} strokeLinecap="round" />
            </g>
          </g>
        </svg>
        {bubble && <div className="nb-bubble mb-16 rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-sm font-bold text-[#0c0b5d] shadow ring-1 ring-slate-200 sm:text-base">
          Namaste!
        </div>}
      </div>
    </div>
  );
}
