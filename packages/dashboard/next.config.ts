import type { NextConfig } from "next";

const config: NextConfig = {
  // @mandate/core ships TypeScript source with NodeNext ".js" import specifiers
  transpilePackages: ["@mandate/core"],
  webpack(c) {
    c.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    return c;
  },
};

export default config;
