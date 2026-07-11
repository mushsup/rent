const fs = require('fs');
const path = require('path');

const dirs = [
    'src/components',
    'src/pages',
    'src/pages/admin'
];

const patterns = [
    { from: /\bbg-gray-900\b(?!(\/|\]|-))/g, to: 'bg-white dark:bg-gray-900' },
    { from: /\bbg-gray-800\b(?!(\/|\]|-))/g, to: 'bg-gray-50 dark:bg-gray-800' },
    { from: /\bbg-gray-750\b(?!(\/|\]|-))/g, to: 'bg-gray-100 dark:bg-gray-750' },
    { from: /\bbg-gray-700\b(?!(\/|\]|-))/g, to: 'bg-gray-200 dark:bg-gray-700' },
    
    { from: /\bbg-gray-900\/50\b/g, to: 'bg-gray-100/50 dark:bg-gray-900/50' },
    { from: /\bbg-gray-800\/50\b/g, to: 'bg-gray-50/50 dark:bg-gray-800/50' },
    { from: /\bbg-gray-700\/50\b/g, to: 'bg-gray-200/50 dark:bg-gray-700/50' },

    { from: /\btext-white\b/g, to: 'text-gray-900 dark:text-white' },
    { from: /\btext-gray-100\b/g, to: 'text-gray-800 dark:text-gray-100' },
    { from: /\btext-gray-200\b/g, to: 'text-gray-700 dark:text-gray-200' },
    { from: /\btext-gray-300\b/g, to: 'text-gray-600 dark:text-gray-300' },
    { from: /\btext-gray-400\b/g, to: 'text-gray-500 dark:text-gray-400' },
    { from: /\btext-gray-500\b/g, to: 'text-gray-400 dark:text-gray-500' },

    { from: /\bborder-gray-800\b(?!(\/|\]|-))/g, to: 'border-gray-200 dark:border-gray-800' },
    { from: /\bborder-gray-700\b(?!(\/|\]|-))/g, to: 'border-gray-300 dark:border-gray-700' },
    { from: /\bborder-gray-600\b(?!(\/|\]|-))/g, to: 'border-gray-400 dark:border-gray-600' },
    
    { from: /\bhover:bg-gray-800\b(?!(\/|\]|-))/g, to: 'hover:bg-gray-100 dark:hover:bg-gray-800' },
    { from: /\bhover:bg-gray-750\b(?!(\/|\]|-))/g, to: 'hover:bg-gray-200 dark:hover:bg-gray-750' },
    { from: /\bhover:bg-gray-700\b(?!(\/|\]|-))/g, to: 'hover:bg-gray-300 dark:hover:bg-gray-700' },
    { from: /\bhover:text-white\b/g, to: 'hover:text-gray-900 dark:hover:text-white' }
];

function processFile(filePath) {
    if (!filePath.endsWith('.jsx')) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('dark:bg-gray-900')) return;

    patterns.forEach(p => {
        content = content.replace(p.from, p.to);
    });
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Converted', filePath);
}

dirs.forEach(dir => {
    const fullDir = path.join(__dirname, dir);
    if (fs.existsSync(fullDir)) {
        fs.readdirSync(fullDir).forEach(file => {
            const filePath = path.join(fullDir, file);
            if (fs.statSync(filePath).isFile()) {
                processFile(filePath);
            }
        });
    }
});
