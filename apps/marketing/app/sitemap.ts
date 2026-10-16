import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/platform", "/urunler", "/cozumler", "/sektorler", "/demo"];

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/demo" ? 0.9 : 0.8,
  }));
}
