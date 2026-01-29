/**
 * Utility to handle HTML tags during translation.
 * It extracts text content and replaces tags with placeholders.
 */

export interface HtmlMap {
  template: string;
  fragments: string[];
}

export class HtmlHandler {
  // Tags that should be treated as part of the text (inline)
  private static readonly INLINE_TAGS = ['b', 'i', 'u', 'strong', 'em', 'span', 'a', 'code', 'small', 'sub', 'sup'];

  /**
   * Simple check if a string contains HTML tags
   */
  static isHtml(text: string): boolean {
    return /<[a-z][\s\S]*>/i.test(text);
  }

  /**
   * Extracts text fragments from HTML and returns a template with placeholders.
   * It respects inline tags by keeping them inside the fragments.
   */
  static extract(html: string): HtmlMap {
    const fragments: string[] = [];
    let counter = 0;

    // 1. Identify all block tags
    // This regex finds tags that are NOT in our INLINE_TAGS list
    const blockTagRegex = /<\/?((?!(?:b|i|u|strong|em|span|a|code|small|sub|sup)\b)[a-z1-6]+)[^>]*>/gi;

    // 2. Split the HTML by block tags, keeping the tags in the result
    const parts = html.split(blockTagRegex);
    
    // Note: split with capturing group returns: [textBefore, tagName, textBefore, tagName, ...]
    // But we need the full tag for the template. Let's use a more precise approach.
    
    let template = html;
    const matches = Array.from(html.matchAll(blockTagRegex));
    
    // We process from end to beginning to not mess up indices
    let lastIdx = html.length;
    const resultFragments: string[] = [];
    
    // We'll build the template by replacing the "content" between block tags
    // For simplicity, let's use a placeholder approach
    
    // Improved strategy: 
    // - Identify block tags positions
    // - Any text between block tags is a "fragment" (which may contain inline tags)
    
    const blockTags = Array.from(html.matchAll(/<[^>]+>/g)).filter(m => {
      const tagName = m[0].match(/<\/?([a-z1-6]+)/i)?.[1]?.toLowerCase();
      return tagName && !this.INLINE_TAGS.includes(tagName);
    });

    let currentHtml = html;
    let offset = 0;
    let finalTemplate = "";
    let lastPos = 0;

    blockTags.forEach((match) => {
      const pos = match.index!;
      const tag = match[0];
      const textBetween = currentHtml.substring(lastPos, pos);
      
      if (textBetween.trim()) {
        const fragIdx = fragments.length;
        fragments.push(textBetween);
        finalTemplate += `[${fragIdx}]`;
      }
      
      finalTemplate += tag;
      lastPos = pos + tag.length;
    });

    const remainingText = currentHtml.substring(lastPos);
    if (remainingText.trim()) {
      const fragIdx = fragments.length;
      fragments.push(remainingText);
      finalTemplate += `[${fragIdx}]`;
    }

    return { template: finalTemplate, fragments };
  }

  /**
   * Rejects translated fragments back into the template
   */
  static restore(template: string, translatedFragments: string[]): string {
    return template.replace(/\[(\d+)\]/g, (match, index) => {
      return translatedFragments[parseInt(index, 10)] !== undefined 
        ? translatedFragments[parseInt(index, 10)] 
        : match;
    });
  }
}
