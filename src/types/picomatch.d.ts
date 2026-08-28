declare module "picomatch" {
  interface PicomatchOptions {
    dot?: boolean;
    nocase?: boolean;
  }

  type PicomatchMatcher = (input: string) => boolean;

  export default function picomatch(
    patterns: string | string[],
    options?: PicomatchOptions,
  ): PicomatchMatcher;
}
