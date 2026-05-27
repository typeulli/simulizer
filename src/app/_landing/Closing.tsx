"use client";

import Link from "next/link";
import { Button } from "@/components/atoms/Button";
import { Icon } from "@/components/atoms/Icons";

type Props = {
    href: string;
    cta: string;
    secondary: string;
    secondaryHref: string;
    title: React.ReactNode;
};

export function Closing({ href, cta, secondary, secondaryHref, title }: Props) {
    return (
        <section className="ld-closing">
            <div className="ld-eyebrow" style={{ justifyContent: "center", display: "inline-flex" }}>
                FINAL · 06
            </div>
            <h2 className="ld-closing-title" style={{ marginTop: 16 }}>
                {title}
            </h2>
            <div
                style={{
                    marginTop: 32,
                    display: "flex",
                    gap: 12,
                    justifyContent: "center",
                    flexWrap: "wrap",
                }}
            >
                <Link href={href}>
                    <Button variant="primary" size="lg" trailing={<Icon.Chevron size={12} dir="right" />}>
                        {cta}
                    </Button>
                </Link>
                <Link href={secondaryHref}>
                    <Button variant="secondary" size="lg" leading={<Icon.Book size={13} />}>
                        {secondary}
                    </Button>
                </Link>
            </div>

            <div className="ld-closing-meta">
                <span>KAIST 부설 한국과학영재학교</span>
                <span>25-059 백재원 · 25-126 홍준서</span>
                <span>정보과학 프로젝트 발표대회 · 2026</span>
            </div>
        </section>
    );
}
