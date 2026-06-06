"use client";
import React from "react";

import { Icon } from "@/components/atoms/Icons";
import { CONFIG_FILENAME } from "@/lib/compileConfig";
import { isBinaryName } from "@/lib/cppBundle";

// Real VS Code Material Icon Theme icons, imported straight from the installed
// `material-icon-theme` package's SVG assets (the package IS the source — no
// copying). Mapping mirrors the theme's own (.cpp → cpp, .hpp → hpp,
// .json → json). Two files get a distinct icon by request:
//   - config.json            → settings (gear) icon
//   - the worker entry point → rocket icon ("entry/launch")
import cppIcon from "material-icon-theme/icons/cpp.svg";
import hppIcon from "material-icon-theme/icons/hpp.svg";
import jsonIcon from "material-icon-theme/icons/json.svg";
import settingsIcon from "material-icon-theme/icons/settings.svg";
import rocketIcon from "material-icon-theme/icons/rocket.svg";
import imageIcon from "material-icon-theme/icons/image.svg";

// The bundler's SVG import is returned as either a bare URL string (Turbopack)
// or a StaticImageData `{ src }` (webpack). Normalize to a URL either way —
// accessing `.src` blindly was what left the icons blank.
type SvgModule = string | { src?: string; default?: string | { src?: string } };
function toSrc(mod: SvgModule): string {
    if (typeof mod === "string") return mod;
    if (mod && typeof mod === "object") {
        if (typeof mod.src === "string") return mod.src;
        const d = mod.default;
        if (typeof d === "string") return d;
        if (d && typeof d.src === "string") return d.src;
    }
    return "";
}

const ICONS = {
    cpp: toSrc(cppIcon as unknown as SvgModule),
    hpp: toSrc(hppIcon as unknown as SvgModule),
    json: toSrc(jsonIcon as unknown as SvgModule),
    settings: toSrc(settingsIcon as unknown as SvgModule),
    rocket: toSrc(rocketIcon as unknown as SvgModule),
    image: toSrc(imageIcon as unknown as SvgModule),
};

type Props = {
    /** File basename, e.g. "main.cpp" / "config.json". */
    name: string;
    /** True when this file is the project's worker entry point. */
    isEntry?: boolean;
    size?: number;
};

function iconSrcFor(name: string, isEntry?: boolean): string | null {
    const lower = name.toLowerCase();
    if (lower === CONFIG_FILENAME) return ICONS.settings;
    if (isEntry && lower.endsWith(".cpp")) return ICONS.rocket;
    if (lower.endsWith(".cpp")) return ICONS.cpp;
    if (lower.endsWith(".hpp")) return ICONS.hpp;
    if (lower.endsWith(".json")) return ICONS.json;
    if (isBinaryName(lower)) return ICONS.image; // any image (.ico/.png/.jpg/…)
    return null;
}

export function FileIcon({ name, isEntry, size = 16 }: Props) {
    const src = iconSrcFor(name, isEntry);
    if (!src) return <Icon.File size={size} />;
    return (
        <img
            src={src}
            width={size}
            height={size}
            alt=""
            draggable={false}
            style={{ display: "block" }}
        />
    );
}

export default FileIcon;
