/**
 * ContentValidator
 * Responsible for assessing the quality and relevance of extracted content.
 */
export class ContentValidator {
  /**
   * Checks for low quality content indicators (bot detection, empty text, script blocks).
   */
  static isLowQuality(content: string): boolean {
    const indicators = [
      content.length < 100,
      content.includes('JavaScript is required'),
      content.includes('Please enable cookies'),
      content.includes('bot detection'),
      content.includes('robot check'),
    ];
    return indicators.some((indicator) => indicator === true);
  }

  /**
   * Determines if the extraction should fall back to a browser based on the error.
   */
  static shouldUseBrowserFallback(error: unknown, url: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    const indicators = [
      err.response?.status === 403,
      err.response?.status === 429,
      err.message?.includes('timeout'),
      err.message?.includes('Low quality content'),
      url.includes('reddit.com'),
      url.includes('twitter.com'),
    ];
    return indicators.some((indicator) => indicator === true);
  }
}
