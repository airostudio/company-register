import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit reads its bundled AFM font files from disk at runtime, so it must
  // not be bundled by webpack.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
