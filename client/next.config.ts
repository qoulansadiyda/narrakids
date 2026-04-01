import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        // Menyembunyikan IPv4 asli di belakang Vercel agar tidak diblokir HTTPS browser
        source: '/api/:path*',
        destination: 'http://202.155.91.76:4000/:path*'
      },
      {
        // Mengalihkan koneksi real-time Socket.io
        source: '/socket.io/:path*',
        destination: 'http://202.155.91.76:4000/socket.io/:path*'
      }
    ]
  }
};

export default nextConfig;
