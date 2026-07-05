import { BadRequestException } from '@nestjs/common';

export async function fetchCodeforcesUserInfo(handles: string): Promise<any[]> {
  let data: any;
  try {
    const res = await fetch(
      `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handles)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    data = await res.json();
  } catch {
    throw new BadRequestException(
      'Unable to reach Codeforces API. Please try again later.',
    );
  }

  if (data?.status !== 'OK' || !data.result) {
    const comment = data?.comment ?? '';
    if (comment.includes('not found') || comment.includes('handle')) {
      throw new BadRequestException('Invalid Codeforces handle');
    }
    throw new BadRequestException(
      'Codeforces API is currently unavailable. Please try again later.',
    );
  }
  return data.result;
}
