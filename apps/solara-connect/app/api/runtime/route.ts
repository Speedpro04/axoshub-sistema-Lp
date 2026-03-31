import { NextResponse } from "next/server";
import { getCacheStatus, getRecommendedCacheEnv } from "@solara/runtime";

export function GET() {
  return NextResponse.json({
    cache: getCacheStatus(),
    env: getRecommendedCacheEnv(),
  });
}
