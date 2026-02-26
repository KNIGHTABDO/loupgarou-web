"use client";
/**
 * SceneBackground — Full-bleed background scene image with graceful fallback.
 * Uses pre-generated Nano Banana Pro scene banners from Supabase Storage.
 * Falls back to CSS gradient if image not yet generated.
 */
import { useState } from "react";
import { SCENE_IMAGES } from "@/lib/image-assets";

type SceneKey = keyof typeof SCENE_IMAGES;

interface Props {
  scene: SceneKey;
  className?: string;
  opacity?: number;
  children?: React.ReactNode;
}

export default function SceneBackground({ scene, className = "", opacity = 0.4, children }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = SCENE_IMAGES[scene];

  const gradients: Record<SceneKey, string> = {
    nightBanner: "radial-gradient(ellipse at 50% 0%, rgba(30,20,60,0.95) 0%, rgba(7,7,15,1) 100%)",
    dayBanner: "radial-gradient(ellipse at 50% 0%, rgba(180,120,40,0.6) 0%, rgba(7,7,15,1) 100%)",
    wolvesWin: "radial-gradient(ellipse at 50% 30%, rgba(180,20,20,0.8) 0%, rgba(7,7,15,1) 100%)",
    villagersWin: "radial-gradient(ellipse at 50% 30%, rgba(30,120,40,0.7) 0%, rgba(7,7,15,1) 100%)",
    loversWin: "radial-gradient(ellipse at 50% 30%, rgba(200,60,120,0.7) 0%, rgba(7,7,15,1) 100%)",
  };

  return (
    <div className={`relative ${className}`}>
      {!imgFailed && (
        <img
          src={url}
          alt=""
          aria-hidden
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity }}
        />
      )}
      {imgFailed && (
        <div
          className="absolute inset-0"
          style={{ background: gradients[scene] }}
        />
      )}
      {/* Always apply a dark gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg-base" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
