import { ImageResponse } from "next/og"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

export const alt = "SUBFROST Articles"
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default async function Image() {
  const logoSrc = await loadOgLogomark()
  const geistMedium = await loadOgFont()

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#ffffff",
          color: "#071224",
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 34,
            padding: "0 92px",
          }}
        >
          <div
            style={{
              width: 146,
              height: 146,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt=""
              style={{
                width: 146,
                height: 146,
                objectFit: "contain",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 88,
                lineHeight: 1,
                letterSpacing: -1,
                fontWeight: 500,
                color: "#071224",
              }}
            >
              subfrost
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 30,
                lineHeight: 1.2,
                fontWeight: 500,
                color: "#51647f",
              }}
            >
              Bitcoin&apos;s next-gen defi experience
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Geist",
          data: geistMedium,
          style: "normal",
          weight: 500,
        },
      ],
    },
  )
}
