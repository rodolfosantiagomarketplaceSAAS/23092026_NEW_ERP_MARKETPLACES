/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.mercadolivre.com.br',
      },
      {
        protocol: 'https',
        hostname: '**.mlstatic.com',
      },
      {
        protocol: 'https',
        hostname: '**.shopee.com.br',
      },
      {
        protocol: 'https',
        hostname: '**.shp.ee',
      },
    ],
  },
};

module.exports = nextConfig;
