import React from 'react';

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-white" aria-hidden="true">
      {/* 1. Subtle High-Tech Architectural Grid with Continuous Drifting Motion */}
      <div
        className="absolute inset-0 opacity-[0.45] mix-blend-multiply"
        style={{
          backgroundImage: `
            radial-gradient(circle at 1px 1px, #94a3b8 1px, transparent 1px),
            linear-gradient(to right, #f1f5f9 1px, transparent 1px),
            linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)
          `,
          backgroundSize: '36px 36px, 72px 72px, 72px 72px',
          animation: 'grid-drift 25s linear infinite'
        }}
      />

      {/* 2. Primary Floating Aurora Orb (Cyan / Sky) - Top-Left */}
      <div
        className="absolute -top-36 -left-36 w-[680px] h-[680px] rounded-full bg-gradient-to-tr from-cyan-400/30 via-sky-300/25 to-blue-200/20 blur-[120px] will-change-transform"
        style={{ animation: 'float-slow 16s ease-in-out infinite alternate' }}
      />

      {/* 3. Secondary Floating Aurora Orb (Indigo / Violet) - Top-Right */}
      <div
        className="absolute top-1/4 -right-36 w-[720px] h-[720px] rounded-full bg-gradient-to-bl from-indigo-400/25 via-purple-300/20 to-pink-200/20 blur-[130px] will-change-transform"
        style={{ animation: 'float-reverse 20s ease-in-out infinite alternate' }}
      />

      {/* 4. Tertiary Floating Aurora Orb (Emerald / Mint) - Bottom-Left */}
      <div
        className="absolute -bottom-40 left-1/4 w-[620px] h-[620px] rounded-full bg-gradient-to-tr from-emerald-400/25 via-teal-300/20 to-cyan-200/20 blur-[120px] will-change-transform"
        style={{ animation: 'float-pulse 18s ease-in-out infinite alternate' }}
      />

      {/* 5. Accent Floating Orb (Amber / Coral) - Center-Right */}
      <div
        className="absolute top-2/3 right-1/4 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-amber-300/20 via-orange-200/20 to-rose-200/15 blur-[110px] will-change-transform"
        style={{ animation: 'float-slow 22s ease-in-out infinite alternate-reverse' }}
      />

      {/* 6. Dynamic Floating Micro-Glow Specks */}
      <div
        className="absolute top-1/3 left-1/2 w-72 h-72 rounded-full bg-cyan-300/20 blur-[80px]"
        style={{ animation: 'float-reverse 12s ease-in-out infinite alternate' }}
      />

      {/* 7. Radiant Ambient Top Scan Beam */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent blur-[1px]" />
    </div>
  );
}
