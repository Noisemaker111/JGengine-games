import type { CSSProperties } from "react";

export const ROAD_PLACES = ["Lantern pines", "Whispering cairns", "The shale ridge", "Copper watch", "The dawn gate"] as const;
const ROAD_PALETTES = [
  { sky: "#182c39", mist: "#658780", light: "#c8b583", far: "#526e70", near: "#364f52", ground: "#334940" },
  { sky: "#292c43", mist: "#7c8390", light: "#c4c4a6", far: "#686b81", near: "#494d63", ground: "#444e48" },
  { sky: "#382d32", mist: "#b08167", light: "#ebc891", far: "#966d65", near: "#644e4c", ground: "#514b3f" },
  { sky: "#243844", mist: "#849b91", light: "#d8b782", far: "#5c787b", near: "#38595f", ground: "#384d49" },
  { sky: "#495363", mist: "#c5ac86", light: "#ffe5a4", far: "#838a82", near: "#576b63", ground: "#4b6050" },
] as const;

/** Original vector artwork authored for Wayfarer Deck. No external assets. */
export function RoadLandscape({ stage, style }: { stage: number; style?: CSSProperties }) {
  const palette = ROAD_PALETTES[stage] ?? ROAD_PALETTES[0];
  return <svg className="road-landscape" style={style} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="road-sky" x2="0" y2="1"><stop stopColor={palette.sky}/><stop offset=".55" stopColor={palette.mist}/><stop offset="1" stopColor={palette.light}/></linearGradient>
      <linearGradient id="road-ground" x2="0" y2="1"><stop stopColor={palette.ground}/><stop offset="1" stopColor="#101f24"/></linearGradient>
      <radialGradient id="road-halo"><stop stopColor="#fff1b1" stopOpacity=".4"/><stop offset="1" stopColor="#fff1b1" stopOpacity="0"/></radialGradient>
    </defs>
    <path fill="url(#road-sky)" d="M0 0h1440v900H0z"/>
    <circle cx="1010" cy="200" r="200" fill="url(#road-halo)"/><circle cx="1010" cy="200" r="55" fill="#e8dba8"/>
    <g fill="#bbc5ab" opacity=".2"><path d="M40 160q200-70 420 0t450-20q-450 75-870 20Z"/><path d="M780 310q300-60 700 0v24q-300-40-700-24Z"/></g>
    <path fill={palette.far} d="M0 430 140 280 260 415 420 230 660 435 830 300 1040 410 1230 270 1440 440v460H0Z"/>
    <path fill={palette.near} d="m0 500 220-120 150 100 210-160 210 165 160-95 290 135 200-80v455H0Z"/>
    <path fill="url(#road-ground)" d="M0 600q320-175 660-40t780-35v375H0Z"/>
    <path fill="#a99b73" opacity=".5" d="M600 900q290-180 160-290t45-136q-80 15-34 130T280 900Z"/>
    <path d="M800 495q-74 40-22 105t-165 240" fill="none" stroke="#dfca91" strokeWidth="3" opacity=".3"/>
    {stage === 0 && <g stroke="#a69362" strokeWidth="3" fill="#eac57d"><path d="M400 605V430m-24 0h48m-24 0 28 18" fill="none"/><path d="m420 448 20 0 4 34h-28Z"/><circle cx="430" cy="467" r="32" fill="url(#road-halo)"/><path d="M940 657V504m-24 0h48m-24 0-24 18" fill="none"/><path d="m906 522 20 0 4 32h-28Z"/></g>}
    {stage === 1 && <g stroke="#9ca58b" strokeWidth="3" fill="#667465"><path d="m420 600 14-29h47l13 29Zm9-30 13-25h32l13 25Zm11-26 9-20h20l8 20Z"/><path d="m894 590 13-35h56l11 35Zm16-35 11-25h34l11 25Zm13-25 7-19h20l7 19Z"/><path d="m345 708 32-89 39-8 37 97Z"/><path d="m369 660 40-8m-32 25 36-4" fill="none"/></g>}
    {stage === 2 && <g fill="#a08b70" stroke="#6f6255" strokeWidth="3"><path d="m330 610 44-95 74 95Zm73 48 41-138 75 154Zm502-83 34-110 56 106Zm-13 92 50-100 50 109Z"/><path d="m1030 737 48-156 83 161Z"/><path d="m358 580 59 10m32 25 42 4m456-97 27 9" fill="none" stroke="#dfc8a0"/></g>}
    {stage === 3 && <g fill="#617777" stroke="#a09374" strokeWidth="3"><path d="M360 640V420h43v220m-51-220h58v-13h-58Zm69 218V450h39v188m-43-188h48v-12h-48Z"/><path d="M932 637V412h41v225m-48-225h56v-14h-56Z"/><path d="m370 470 23 18-23 18m574-39 18 18-18 18" fill="none" stroke="#c7a16e"/><path d="m407 591 31-8 16 37-50 10Z"/></g>}
    {stage === 4 && <g fill="#718674" stroke="#dbcd9b" strokeWidth="4"><path d="M380 638V368h55v270m446 0V368h55v270M420 397q231-259 480 0v50q-249-259-480 0Z"/><path d="m369 368 78 0v-20h-78Zm501 0h78v-20h-78Z"/><path d="m398 437 20 9m-20 70 20 9m477-82 20 9m-20 64 20 9" fill="none"/><path d="M480 420q180-205 356 0" fill="none" stroke="#ffe4a0" opacity=".5"/><circle cx="660" cy="344" r="22" fill="url(#road-halo)"/></g>}
    <g fill="#142c30" stroke="#28433d" strokeWidth="4">
      {[60,160,1250,1370].map((x,i)=><g key={x} transform={`translate(${x} ${400+i%2*65}) scale(${1.1+i*.15})`}><path d="M0 250V0M-65 110 0 0l65 110H35l48 85H-83l48-85Z"/><path d="m-56 190-45 75H101l-45-75Z"/></g>)}
    </g>
    <g transform="translate(1020 398)" fill="#364c45" stroke="#879083" strokeWidth="2"><path d="M0 133V10h34v123M94 133V10h34v123M24 10q40-66 80 0v30q-40-54-80 0Z"/><path d="M-5 10h45V0H-5ZM88 10h45V0H88Z"/><path d="M8 53h18m75 14h19M8 88h18m75 12h19"/></g>
    <g fill="#14292b" stroke="#6b7866" strokeWidth="3"><path d="m210 640 30-110 52-8 30 118Z"/><path d="m228 580 63-5m-70 35 78-3"/><path d="m1100 705 22-87 42-5 35 87Z"/></g>
    <g fill="#dfb562" opacity=".65">{Array.from({length:14},(_,i)=><circle key={i} cx={260+i*77} cy={575+(i*37)%160} r={i%3===0?3:1.5}/>)}</g>
  </svg>;
}

export function EnemyArt({ index, style }: { index: number; style?: CSSProperties }) {
  return <svg className="enemy-art" style={style} viewBox="0 0 320 300" role="img" aria-label={["Amber-eyed ooze with a crown of branches", "Cairn spirit under a mossy stone hood", "Armored ridge beetle with hooked tusks", "Copper sentry carrying a tower shield", "Ancient gate guardian with a glowing heart"][index]}>
    <defs><linearGradient id="creature-shell" x2=".5" y2="1"><stop stopColor="#a1b48a"/><stop offset="1" stopColor="#31473e"/></linearGradient><linearGradient id="creature-metal" x2=".8" y2="1"><stop stopColor="#d0ac76"/><stop offset=".5" stopColor="#846a55"/><stop offset="1" stopColor="#343d3b"/></linearGradient><radialGradient id="creature-glow"><stop stopColor="#ffe6a0"/><stop offset="1" stopColor="#db8b46"/></radialGradient></defs>
    <ellipse cx="160" cy="272" rx="112" ry="14" fill="#081b20" opacity=".65"/>
    {index===0 && <g stroke="#203b35" strokeWidth="4" strokeLinejoin="round"><path d="m105 115-13-64 19 17 7-37 23 64m41 7 36-72 2 38 24-12-20 73" fill="#526449"/><path d="M52 230q-3-71 60-116 21-42 55-17 88 11 102 117 40 35-2 45-39 13-92-3-43 22-88 3-59 12-35-29Z" fill="url(#creature-shell)"/><path d="M77 219q8-68 60-83m62-14q40 20 48 65" fill="none" stroke="#c8d6a0" strokeWidth="8" opacity=".5"/><path d="m102 181 34 5-17 19Zm75 6 40-13-17 30Z" fill="#f8cc66"/><path d="m115 232q41-25 87-5" fill="none"/><g fill="#657b4c"><circle cx="87" cy="238" r="11"/><circle cx="239" cy="232" r="14"/><circle cx="181" cy="142" r="9"/></g></g>}
    {index===1 && <g stroke="#273d37" strokeWidth="4" strokeLinejoin="round"><path d="m90 263 29-110 41-20 47 16 32 114Z" fill="#536757"/><path d="m97 160 8-70 55-55 61 40 9 94-59 31Z" fill="url(#creature-shell)"/><path d="m122 146 14-52 37-20 26 33 4 51-44 17Z" fill="#182e31"/><path d="m144 119 16 8 18-14" fill="none" stroke="#e9c573"/><path d="m144 199-15 51m56-51 11 53M99 109l24-7m69-37 12 24m-99 61 26 7" fill="none" stroke="#a7af85"/><path d="m115 178-46 33 8 19 49-16m80-38 39 41-12 11-40-23" fill="#77896d"/><path d="m72 260-5-146m-12 0h25l-12-27Z" fill="none" stroke="#c2a770"/><g fill="#9ba56b"><path d="m120 75 25-30 30 4-9 21Z"/><path d="m191 144 32-18 3 37-19 4Z"/></g></g>}
    {index===2 && <g stroke="#233b35" strokeWidth="4" strokeLinejoin="round"><path d="m94 169-42-14-22 30m62 27-49 12-12 30m186-85 39-13 35 24m-69 32 39 21 24 30" fill="none" stroke="#a7a17b" strokeWidth="12"/><path d="M86 240q-28-134 76-178 100 41 76 178Z" fill="url(#creature-shell)"/><path d="m159 68 2 172m-55-106 54 21 60-20m-72-45-29-12m50 11 28-13" fill="none" stroke="#c5c39b" strokeWidth="6"/><path d="m118 200 44-31 44 31-8 52h-66Z" fill="#475547"/><path d="m125 225-12 35-20-28m101-7 14 35 19-27" fill="#dcc99b"/><path d="m137 202 12 7m26 0 12-7" fill="none" stroke="#ffce71" strokeWidth="8"/></g>}
    {index===3 && <g stroke="#273b3b" strokeWidth="4" strokeLinejoin="round"><path d="m126 237-8 35h35l5-38m17 0 4 38h35l-12-45" fill="url(#creature-metal)"/><path d="m103 110 23-14h70l28 24-19 113-84 3Z" fill="url(#creature-metal)"/><path d="m131 65 28-19 39 19-5 35h-59Z" fill="url(#creature-metal)"/><path d="M139 78h44" stroke="#ffcf73" strokeWidth="8"/><path d="m145 115 27 18-16 58-25-25Z" fill="#c8bc90"/><path d="m208 129 26 31-11 50" fill="none" stroke="#bca17b" strokeWidth="18"/><path d="m235 232-8-128m-17 13h35" stroke="#d9bd86" strokeWidth="6"/><path d="m58 127 44-15 28 22-8 91-37 28-38-30Z" fill="#466763"/><path d="m85 126 8 106m-36-80 61 9" fill="none" stroke="#c4a779" strokeWidth="7"/><circle cx="91" cy="171" r="13" fill="url(#creature-glow)"/></g>}
    {index===4 && <g stroke="#253c3a" strokeWidth="4" strokeLinejoin="round"><path d="m90 228-16 44h62l15-41m26 0 10 41h64l-22-49" fill="#707b64"/><path d="m90 99 54-17h36l57 15-16 137-37 16h-46l-39-18Z" fill="url(#creature-shell)"/><path d="m125 53 35-19 40 18-9 42h-58Z" fill="#a9ae8b"/><path d="m119 56-10-27 29 14m57 2 24-16-9 33" fill="#737f6a"/><path d="m140 68 17 5 20-5" stroke="#ffdb86" strokeWidth="8"/><path d="m94 108-36 13-19 73 34 23 33-41m128-69 36 15 21 72-32 24-31-43" fill="#7e8c71"/><path d="m55 150 31 6m154-6 32 4m-137 32 29 14 27-14-26-37Z" fill="none" stroke="#c2c4a0"/><path d="m143 125 19-18 22 18-5 35-17 13-18-14Z" fill="url(#creature-glow)"/><path d="m115 205 38 10 54-11m-45 13v27" fill="none"/><g fill="#91a271"><path d="m63 129-10 28 23-7Z"/><path d="m200 96 17-25 17 28Z"/></g></g>}
  </svg>;
}
