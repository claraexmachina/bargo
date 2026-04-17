/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Transpile workspace packages (source TypeScript)
  transpilePackages: ['@bargo/shared', '@bargo/crypto'],

  webpack(config) {
    // Workspace packages use ESM ".js" extension in internal imports (TypeScript bundler convention).
    // Webpack doesn't understand that pattern, so we teach it to resolve .js → .ts for
    // packages inside our monorepo.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
