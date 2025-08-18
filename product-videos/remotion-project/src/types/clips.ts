export interface Beat {
  id: string;
  in: string;
  out: string;
  label?: string;
  note?: string;
}

export interface Clip {
  id: string;
  beats: Beat[];
  durationTargetSec: number;
}