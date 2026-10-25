import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Apify-imported Meetup / Eventbrite event photos
      {
        protocol: "https",
        hostname: "secure.meetupstatic.com",
      },
      {
        protocol: "https",
        hostname: "**.meetupstatic.com",
      },
      {
        protocol: "https",
        hostname: "img.evbuc.com",
      },
      {
        protocol: "https",
        hostname: "cdn.evbuc.com",
      },
      {
        protocol: "https",
        hostname: "images.lumacdn.com",
      },
      {
        protocol: "https",
        hostname: "**.lumacdn.com",
      },
      // ClassPass studio photos (Apify places ingest)
      {
        protocol: "https",
        hostname: "classpass-res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "**.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
