import { ImageResponse } from "next/og";
import { Logo } from "@/components/atoms/Logo";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Logo size={32} accentColor="#2f7fb8" strokeColor="#0b0e14" />
            </div>
        ),
        { ...size },
    );
}
