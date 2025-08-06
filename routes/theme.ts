import { safeQuery } from "../database.ts";
import { withRoot, withBody } from "../utils.ts";

const themes: Record<string, Record<string, string>> = {
  default: {
    '--bg': '#f3f4f6',
    '--text': '#111827',
    '--primary': '#3b82f6',
    '--danger': '#ef4444',
    '--warning': '#eab308',
    '--success': '#22c55e',
    '--mauve': '#a78bfa',
    '--surface': '#ffffff',
    '--shadow': 'rgba(0,0,0,0.1)',
    '--border': '#d1d5db',
    '--muted': '#6b7280'
  },
  'catppuccin-mocha': {
    '--bg': '#1e1e2e',
    '--text': '#cdd6f4',
    '--primary': '#89b4fa',
    '--danger': '#f38ba8',
    '--warning': '#fab387',
    '--success': '#a6e3a1',
    '--mauve': '#cba6f7',
    '--surface': '#313244',
    '--shadow': 'rgba(205,214,244,0.1)',
    '--border': '#6c7086',
    '--muted': '#9399b2'
  },
  'catppuccin-latte': {
    '--bg': '#eff1f5',
    '--text': '#4c4f69',
    '--primary': '#1e66f5',
    '--danger': '#d20f39',
    '--warning': '#fe640b',
    '--success': '#40a02b',
    '--mauve': '#8839ef',
    '--surface': '#ccd0da',
    '--shadow': 'rgba(76,79,105,0.1)',
    '--border': '#9ca0b0',
    '--muted': '#6c6f85'
  },
  'catppuccin-frappe': {
    '--bg': '#303446',
    '--text': '#c6d0f5',
    '--primary': '#8caaee',
    '--danger': '#e78284',
    '--warning': '#ef9f76',
    '--success': '#a6d189',
    '--mauve': '#ca9ee6',
    '--surface': '#414559',
    '--shadow': 'rgba(198,208,245,0.1)',
    '--border': '#737994',
    '--muted': '#a5adce'
  },
  'catppuccin-macchiato': {
    '--bg': '#24273a',
    '--text': '#cad3f5',
    '--primary': '#8aadf4',
    '--danger': '#ed8796',
    '--warning': '#f5a97f',
    '--success': '#a6da95',
    '--mauve': '#c6a0f6',
    '--surface': '#494d64',
    '--shadow': 'rgba(202,211,245,0.1)',
    '--border': '#5b6078',
    '--muted': '#a5adcb'
  }
};

export const getTheme = async (_req: Request) => {
  const [[themeName]] = safeQuery("SELECT value FROM global_settings WHERE key = 'theme'");
  const theme = (themeName as string || 'default');
  const colors = themes[theme] || themes.default;
  return new Response(JSON.stringify({ colors }), { headers: { "Content-Type": "application/json" } });
};

interface ThemeBody {
  theme: string;
}

const validateThemeBody = (body: any): ThemeBody => {
  const { theme } = body;
  if (!theme || typeof theme !== "string" || !Object.keys(themes).includes(theme)) throw new Error("Invalid theme");
  return { theme };
};

export const postTheme = withRoot(withBody(
  validateThemeBody,
  async (_req, { theme }) => {
    safeQuery("UPDATE global_settings SET value = ? WHERE key = 'theme'", [theme], "Theme update failed");
    return new Response("ok");
  }
));
