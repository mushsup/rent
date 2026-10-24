const transliteration: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

export function slugify(value: string): string {
    return value
        .toLowerCase()
        .split('')
        .map(character => transliteration[character] ?? character)
        .join('')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 75)
        .replace(/-+$/g, '');
}

export const RESERVED_SLUGS = new Set(['admin', 'bikes', 'bike', 'payments', 'tasks', 'history', 'tenant']);

export function uniqueSlug(base: string, existingSlugs: Iterable<string>): string {
    // Static client routes win over /:slug, so tenant slugs must never
    // shadow them (a tenant named "Bikes" would otherwise hijack /bikes).
    const normalizedExisting = new Set(Array.from(existingSlugs, slug => slug.toLowerCase()));
    RESERVED_SLUGS.forEach(slug => normalizedExisting.add(slug));
    const cleanBase = slugify(base) || 'tenant';
    if (!normalizedExisting.has(cleanBase)) return cleanBase;

    let suffix = 2;
    while (normalizedExisting.has(`${cleanBase}-${suffix}`)) suffix += 1;
    return `${cleanBase}-${suffix}`;
}
