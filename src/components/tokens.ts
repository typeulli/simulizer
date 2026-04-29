const v = (name: string): string => `var(--${name})`;

// ── Color ─────────────────────────────────────────────────────────────
export const color = {
    bg:          v('bg'),
    bgSubtle:    v('bg-subtle'),
    bgMuted:     v('bg-muted'),
    bgRaised:    v('bg-raised'),
    bgCanvas:    v('bg-canvas'),
    bgCode:      v('bg-code'),
    bgInverse:   v('bg-inverse'),

    surface:       v('surface'),
    surfaceHover:  v('surface-hover'),
    surfaceActive: v('surface-active'),
    surfaceSunken: v('surface-sunken'),

    border:       v('border'),
    borderStrong: v('border-strong'),
    borderSubtle: v('border-subtle'),
    borderFocus:  v('border-focus'),

    fg:         v('fg'),
    fgStrong:   v('fg-strong'),
    fgMuted:    v('fg-muted'),
    fgSubtle:   v('fg-subtle'),
    fgDisabled: v('fg-disabled'),
    fgOnAccent: v('fg-on-accent'),
    fgInverse:  v('fg-inverse'),

    accent:       v('accent'),
    accentHover:  v('accent-hover'),
    accentActive: v('accent-active'),
    accentSoft:   v('accent-soft'),
    accentSubtle: v('accent-subtle'),
    accentBorder: v('accent-border'),

    success:       v('success'),
    successSoft:   v('success-soft'),
    successBorder: v('success-border'),

    warning:       v('warning'),
    warningSoft:   v('warning-soft'),
    warningBorder: v('warning-border'),

    danger:       v('danger'),
    dangerSoft:   v('danger-soft'),
    dangerBorder: v('danger-border'),

    info:       v('info'),
    infoSoft:   v('info-soft'),
    infoBorder: v('info-border'),

    addBlockColor:    v('add-block-color'),
    deleteBlockColor: v('delete-block-color'),
    nochangeBlockColor : v('nochange-block-color'),

    scrim:   v('scrim'),
    gridDot: v('grid-dot'),

    gradient: {
        title:  `linear-gradient(120deg, ${v('accent')}, oklch(62% 0.16 160))`,
        run:    'linear-gradient(135deg, #84cc16, #22c55e)',
        ai:     `linear-gradient(135deg, ${v('accent')}, oklch(62% 0.16 160))`,
        wat:    'linear-gradient(135deg, #0e7490, #065f46)',
        blocks: 'linear-gradient(135deg, #92400e, #7c2d12)',
        reset:  v('surface'),
        header: `linear-gradient(90deg, ${v('bg-code')}, ${v('bg')})`,
    },
} as const;

// ── Typography ────────────────────────────────────────────────────────
export const font = {
    family: {
        sans: v('font-sans'),
        mono: v('font-mono'),
    },
    size: {
        fs10: v('fs-10'), fs11: v('fs-11'), fs12: v('fs-12'), fs13: v('fs-13'),
        fs14: v('fs-14'), fs15: v('fs-15'), fs16: v('fs-16'), fs18: v('fs-18'),
        fs20: v('fs-20'), fs24: v('fs-24'), fs28: v('fs-28'), fs32: v('fs-32'),
        fs40: v('fs-40'), fs48: v('fs-48'), fs56: v('fs-56'), fs72: v('fs-72'),
    },
    weight: {
        regular:  v('fw-regular'),
        medium:   v('fw-medium'),
        semibold: v('fw-semibold'),
        bold:     v('fw-bold'),
        black:    v('fw-black'),
    },
    lineHeight: {
        tight:   v('lh-tight'),
        snug:    v('lh-snug'),
        base:    v('lh-base'),
        relaxed: v('lh-relaxed'),
    },
    tracking: {
        tighter: v('tracking-tighter'),
        tight:   v('tracking-tight'),
        normal:  v('tracking-normal'),
        wide:    v('tracking-wide'),
        wider:   v('tracking-wider'),
        widest:  v('tracking-widest'),
    },
} as const;

// ── Spacing (Tailwind-style: sp1=4px, sp2=8px …) ─────────────────────
export const space = {
    sp0:   v('sp-0'),    //  0px
    spPx:  v('sp-px'),  //  1px
    sp05:  v('sp-0-5'), //  2px
    sp1:   v('sp-1'),   //  4px
    sp15:  v('sp-1-5'), //  6px
    sp2:   v('sp-2'),   //  8px
    sp25:  v('sp-2-5'), // 10px
    sp3:   v('sp-3'),   // 12px
    sp4:   v('sp-4'),   // 16px
    sp5:   v('sp-5'),   // 20px
    sp6:   v('sp-6'),   // 24px
    sp7:   v('sp-7'),   // 28px
    sp8:   v('sp-8'),   // 32px
    sp10:  v('sp-10'),  // 40px
    sp12:  v('sp-12'),  // 48px
    sp14:  v('sp-14'),  // 56px
    sp16:  v('sp-16'),  // 64px
    sp20:  v('sp-20'),  // 80px
    sp24:  v('sp-24'),  // 96px
} as const;

// ── Border Radius ─────────────────────────────────────────────────────
export const radius = {
    none: v('r-none'),
    xs:   v('r-xs'),
    sm:   v('r-sm'),
    md:   v('r-md'),
    lg:   v('r-lg'),
    xl:   v('r-xl'),
    xl2:  v('r-2xl'),
    xl3:  v('r-3xl'),
    full: v('r-full'),
} as const;

// ── Shadow ────────────────────────────────────────────────────────────
export const shadow = {
    xs:    v('shadow-xs'),
    sm:    v('shadow-sm'),
    md:    v('shadow-md'),
    lg:    v('shadow-lg'),
    xl:    v('shadow-xl'),
    focus: v('shadow-focus'),
    inset: v('shadow-inset'),
} as const;

// ── Motion ────────────────────────────────────────────────────────────
export const motion = {
    duration: {
        fast:   v('motion-fast'),
        base:   v('motion-base'),
        slow:   v('motion-slow'),
        slower: v('motion-slower'),
    },
    easing: {
        out:    v('ease-out'),
        in:     v('ease-in'),
        inOut:  v('ease-in-out'),
        spring: v('ease-spring'),
    },
    transition: {
        fast: v('t-fast'),
        base: v('t-base'),
        slow: v('t-slow'),
    },
} as const;

// ── Control Height ────────────────────────────────────────────────────
export const height = {
    xs:  v('h-xs'),
    sm:  v('h-sm'),
    md:  v('h-md'),
    lg:  v('h-lg'),
    xl:  v('h-xl'),
    xl2: v('h-2xl'),
} as const;

// ── 단일 진입점 ───────────────────────────────────────────────────────
export const token = { color, font, space, radius, shadow, motion, height } as const;