import type { DrawRoundStatus, WinnerStatus } from "@prisma/client";

export type RoundResult = {
  id: string;
  prizeId: string;
  targetGroupId: string;
  winnerCount: number;
  status: DrawRoundStatus;
  version: number;
  candidateCount?: number;
  winners: Array<{
    id: string;
    guestId: string;
    name: string;
    status: WinnerStatus;
  }>;
};

export type CreateRoundInput = {
  prizeId: string;
  targetGroupId: string;
  winnerCount: number;
};
