const palette = {
  neutral: {
    0:   "#ffffff", // L=100%
    50:  "#f2f2f2", // L= 95%
    100: "#e6e6e6", // L= 90%
    200: "#cccccc", // L= 80%
    300: "#b3b3b3", // L= 70%
    400: "#999999", // L= 60%
    500: "#808080", // L= 50% Base
    600: "#666666", // L= 40%
    700: "#4d4d4d", // L= 30%
    800: "#333333", // L= 20%
    900: "#1a1a1a", // L= 10%
    950: "#0d0d0d", // L=  5%
  },
  primary: {
    50:  "#fff0f9",
    100: "#ffe3f4",
    200: "#ffc7eb",
    300: "#ff9fde",
    400: "#ff70cd",
    500: "#ff4ebb", // Base
    600: "#e62ea0",
    700: "#cc1485",
    800: "#a80f6e",
    900: "#850055",
    950: "#5c003b",
  },
  cream: {
    50:  "#fffdf5",
    100: "#fffbe8",
    200: "#fff9de",
    300: "#fff5d1", // Base
    400: "#ffeeb8",
    500: "#e8d9a0",
    600: "#d4c285",
    700: "#bfac6b",
    800: "#aa9652",
    900: "#94803b",
    950: "#574d22",
  },
  red: {
    50:  "#fff0f0",
    100: "#ffe0e0",
    200: "#ffc2c2",
    300: "#ffa3a3",
    400: "#ff7575",
    500: "#ff4444", // Base
    600: "#e62e2e",
    700: "#cc1f1f",
    800: "#a81616",
    900: "#8a0f0f",
    950: "#570000",
  },
  orange: {
    50:  "#fff8ed",
    100: "#ffeddb",
    200: "#ffdcc2",
    300: "#ffc799",
    400: "#ffad66",
    500: "#ff9100", // Base
    600: "#e67a00",
    700: "#cc6600",
    800: "#a85000",
    900: "#8a3d00",
    950: "#5c2600",
  },
  yellow: {
    50:  "#fffced",
    100: "#fff9db",
    200: "#fff3b8",
    300: "#ffeb8f",
    400: "#ffe05c",
    500: "#ffd500", // Base
    600: "#e6bc00",
    700: "#cca300",
    800: "#a88300",
    900: "#8a6800",
    950: "#574000",
  },
  green: {
    50:  "#edfff1",
    100: "#dbffe2",
    200: "#b8ffc6",
    300: "#8fff9f",
    400: "#5cff73",
    500: "#00c22a", // Base
    600: "#00a323",
    700: "#00851d",
    800: "#006616",
    900: "#004d11",
    950: "#002e08",
  },
  cyan: {
    50:  "#f0fdff",
    100: "#dbfbff",
    200: "#b8f8ff",
    300: "#8ff4ff",
    400: "#5cefbd",
    500: "#3decfd", // Base
    600: "#2bc5d6",
    700: "#1fa1b3",
    800: "#15808f",
    900: "#0e606b",
    950: "#063a40",
  },
  blue: {
    50:  "#f0f1ff",
    100: "#e3e5ff",
    200: "#c9ccff",
    300: "#a7acff",
    400: "#8f96ff",
    500: "#7b83ff", // Base
    600: "#5d64e0",
    700: "#454bc2",
    800: "#3237a3",
    900: "#222788",
    950: "#111450",
  },
  purple: {
    50:  "#f6f0ff",
    100: "#eddbff",
    200: "#dcb8ff",
    300: "#c78fff",
    400: "#ad5cff",
    500: "#7828c8", // Base
    600: "#631fa8",
    700: "#50188a",
    800: "#3f126e",
    900: "#2f0d52",
    950: "#1d0636",
  },
} as const;

const color = {
    textColors: {
      body:     palette.neutral[950],       // Deepest dark
      subtle:   palette.neutral[500],
      subtlest: palette.neutral[300],
      inverse:  palette.neutral[0],
      error:    palette.red[700],
      warning:  palette.yellow[800],        // Yellow needs to be darker for text
      success:  palette.green[700],
      info:     palette.blue[700],
    },

    bgColors: {
      canvas:    palette.neutral[200],
      subtle:  palette.neutral[100],
      elevated: palette.neutral[0],
      // raw rgba: state.opacity is in index.ts, circular import not allowed — use literal value
      overlay: "rgba(0,0,0,0.6)" as string,

      status: {
        error:   palette.red[50],
        warning: palette.yellow[50],
        success: palette.green[50],
        info:    palette.blue[50],
      },

      // Accent Fill (Base = 500)
      accent: {
        primary: palette.primary[100],
        cream: palette.cream[100],
        red:     palette.red[100],
        orange:  palette.orange[100],
        yellow:  palette.yellow[100],
        green:   palette.green[100],
        cyan:    palette.cyan[100],
        blue:    palette.blue[100],
        purple:  palette.purple[100],
        gray: palette.neutral[100],
      },

      // Accent Fill (Hover/Pressed = 600)
      accentDark: {
        primary: palette.primary[200],
        cream:   palette.cream[200],
        red:     palette.red[200],
        orange:  palette.orange[200],
        yellow:  palette.yellow[200],
        green:   palette.green[200],
        cyan:    palette.cyan[200],
        blue:    palette.blue[200],
        purple:  palette.purple[200],
        gray: palette.neutral[200],
      },

      // Accent Fill (Active/Deep = 700)
      accentDarker: {
        primary: palette.primary[300],
        cream: palette.cream[300],
        red:     palette.red[300],
        orange:  palette.orange[300],
        yellow:  palette.yellow[300],
        green:   palette.green[300],
        cyan:    palette.cyan[300],
        blue:    palette.blue[300],
        purple:  palette.purple[300],
        gray: palette.neutral[300],
      },

      // Accent Fill (Subtle = 100 or 200)
      accentLight: {
        primary: palette.primary[50],
        cream: palette.cream[50],
        red:     palette.red[50],
        orange:  palette.orange[50],
        yellow:  palette.yellow[50],
        green:   palette.green[50],
        cyan:    palette.cyan[50],
        blue:    palette.blue[50],
        purple:  palette.purple[50],
        gray: palette.neutral[50],
      },

    //   // Accent FG (Contrast Text)
    //   accentFg: (() => {
    //     const light = p.neutral[0];
    //     const dark  = p.neutral[950];
    //     return {
    //       primary: pickFg(p.primary[500],    light, dark),
    //       red:     pickFg(p.red[500],        light, dark),
    //       orange:  pickFg(p.orange[500],     light, dark),
    //       yellow:  pickFg(p.yellow[500],     light, dark),
    //       green:   pickFg(p.green[500],      light, dark),
    //       cyan:    pickFg(p.cyan[500],       light, dark),
    //       blue:    pickFg(p.blue[500],       light, dark),
    //       purple:  pickFg(p.purple[500],     light, dark),
    //       black:   pickFg(p.neutral[900],    light, dark),
    //       white:   pickFg(p.neutral[0],      light, dark),
    //       bg:      pickFg(p.retroCream[300], light, dark),
    //     };
    //   })(),
    },

    borderColors: {
      default:     palette.neutral[950],
      interactive: palette.neutral[400],
      subtle:      palette.neutral[200],
      status: {
        error:   palette.red[500],
        warning: palette.yellow[500],
        success: palette.green[500],
        info:    palette.blue[500],
      },
    },

    // utilityColors: {
    //   divider:   p.retroCream[500],
    //   track:     p.neutral[200],
    //   focusRing: p.primary[500],
    // },
  };

// TODO: Add Border, Border Radius, Typography, Spacing.

// ── 다크 테마 시맨틱 토큰 ─────────────────────────────────────────────────────

export const darkTheme = {
  color: {
    bg: {
      root:    "#0d0d1a",
      surface: "#0f0f1e",
      raised:  "#0a0a18",
      inset:   "#0a1628",
      modal:   "#0d0d1a",
    },
    border: {
      default: "#1e1b4b",
      strong:  "#2a2060",
    },
    text: {
      primary: "#e0e0f0",
      accent:  "#a78bfa",
      muted:   "#64748b",
      code:    "#7dd3fc",
      success: "#34d399",
      error:   "#f87171",
      warning: "#f59e0b",
    },
    gradient: {
      title:  "linear-gradient(135deg,#a78bfa,#38bdf8)",
      header: "linear-gradient(90deg,#1a0a2e,#0d1a3a)",
      run:    "linear-gradient(135deg,#84cc16,#22c55e)",
      ai:     "linear-gradient(135deg,#7c3aed,#2563eb)",
      wat:    "linear-gradient(135deg,#0e7490,#065f46)",
      blocks: "linear-gradient(135deg,#92400e,#7c2d12)",
      reset:  "#1e1b4b",
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  fontSize: {
    xs:   10,
    sm:   11,
    md:   12,
    base: 13,
    lg:   17,
    xl:   28,
  },
  borderRadius: {
    sm: 4,
    md: 6,
    lg: 10,
  },
  font: {
    mono: "'JetBrains Mono','Fira Code',monospace",
  },
} as const;