"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff } from "lucide-react";
import { upgradeMlThumbnailUrl } from "./formatters";

interface ProductThumbnailPreviewProps {
  thumbnailUrl: string | null | undefined;
  title: string;
  permalink?: string | null;
  sizeClassName?: string;
}

interface FloatingPosition {
  top: number;
  left: number;
}

const PREVIEW_BOX_WIDTH = 280;
const PREVIEW_BOX_HEIGHT = 308;
const VIEWPORT_MARGIN = 14;

/**
 * Miniatura de produto com zoom de alta resolução renderizado em `document.body` via Portal (`position: fixed`).
 * Escapa de containers `overflow-x-auto` e cabeçalhos `<thead>` / `<Header>`, impedindo qualquer corte visual.
 */
export function ProductThumbnailPreview({
  thumbnailUrl,
  title,
  permalink,
  sizeClassName = "w-16 h-16",
}: ProductThumbnailPreviewProps) {
  const [mounted, setMounted] = useState(false);
  const [hoverPos, setHoverPos] = useState<FloatingPosition | null>(null);
  const [useFallbackSrc, setUseFallbackSrc] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setUseFallbackSrc(false);
  }, [thumbnailUrl]);

  useEffect(() => {
    if (!hoverPos) return;
    const closeOnScroll = () => setHoverPos(null);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [hoverPos]);

  const safeOriginalUrl = thumbnailUrl
    ? thumbnailUrl.replace(/^http:\/\//i, "https://")
    : null;
  const hdUrl = upgradeMlThumbnailUrl(thumbnailUrl);
  const activeZoomSrc = useFallbackSrc ? safeOriginalUrl : hdUrl || safeOriginalUrl;

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
    if (!safeOriginalUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.right + 12;
    if (left + PREVIEW_BOX_WIDTH > vw - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, rect.left - PREVIEW_BOX_WIDTH - 12);
    }

    const centeredTop = rect.top + rect.height / 2 - PREVIEW_BOX_HEIGHT / 2;
    const top = Math.min(
      Math.max(VIEWPORT_MARGIN, centeredTop),
      Math.max(VIEWPORT_MARGIN, vh - PREVIEW_BOX_HEIGHT - VIEWPORT_MARGIN)
    );

    setHoverPos({ top, left });
  }

  function handleMouseLeave() {
    setHoverPos(null);
  }

  const imageElement = safeOriginalUrl ? (
    <img
      src={safeOriginalUrl}
      alt={title}
      className="w-full h-full object-contain transition-transform duration-150 group-hover:scale-105"
      loading="lazy"
    />
  ) : (
    <ImageOff className="w-6 h-6 text-slate-300" />
  );

  return (
    <div
      className="group relative shrink-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`${sizeClassName} rounded-xs border border-slate-200 bg-white p-1 overflow-hidden flex items-center justify-center shadow-2xs hover:border-sky-500 transition-colors`}
      >
        {safeOriginalUrl && permalink ? (
          <a
            href={permalink}
            target="_blank"
            rel="noreferrer"
            title="Clique para abrir anúncio oficial no Mercado Livre"
            className="w-full h-full flex items-center justify-center"
          >
            {imageElement}
          </a>
        ) : (
          imageElement
        )}
      </div>

      {mounted &&
        hoverPos &&
        activeZoomSrc &&
        createPortal(
          <div
            style={{
              top: hoverPos.top,
              left: hoverPos.left,
              width: PREVIEW_BOX_WIDTH,
            }}
            className="pointer-events-none fixed z-[9999] bg-white border-2 border-slate-900 rounded shadow-2xl overflow-hidden transition-opacity duration-100"
          >
            <div className="w-full h-60 bg-white p-3 flex items-center justify-center">
              <img
                src={activeZoomSrc}
                alt={title}
                onError={() => {
                  if (!useFallbackSrc && safeOriginalUrl && activeZoomSrc !== safeOriginalUrl) {
                    setUseFallbackSrc(true);
                  }
                }}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="px-3 py-2 bg-slate-900 text-white text-[11px] font-semibold leading-snug line-clamp-2 border-t border-slate-800">
              {title}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
