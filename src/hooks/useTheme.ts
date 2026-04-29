"use client";

import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

function readTheme(): Theme {
    return (document.documentElement.getAttribute("data-theme") ?? "light") as Theme;
}

function applyTheme(theme: Theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.cookie = `theme=${theme}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>("light");

    useEffect(() => {
        setThemeState(readTheme());

        const observer = new MutationObserver(() => {
            setThemeState(readTheme());
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => observer.disconnect();
    }, []);

    const toggleTheme = useCallback(() => {
        const next: Theme = readTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
    }, []);

    return { theme, toggleTheme };
}
