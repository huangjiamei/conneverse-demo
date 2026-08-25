/**
 * 落地页字体 —— 走 next/font/google,不用 <link>。
 *
 * next/font 在构建期把字体文件下载进产物并自我托管:没有对 fonts.googleapis.com
 * 的运行时请求,也就没有那一跳的 FOUT 和第三方依赖。
 *
 * 只暴露 CSS 变量,不直接给 className —— 哪一层用衬线、哪一层用等宽,交给
 * Tailwind 的 font-* 工具类决定 (见 globals.css 里的 --font-*-ph)。
 */

import { Newsreader, Space_Mono } from "next/font/google";

/** 标题 + 正文。可变字体,opsz 轴由浏览器按字号自动取值 */
export const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-newsreader",
});

/** eyebrow / 小标签 / 卡片里的等宽字 */
export const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-space-mono",
});
