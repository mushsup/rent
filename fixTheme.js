const fs = require('fs');
const path = require('path');

const filesToFix = [
    'src/components/Layout.jsx',
    'src/pages/admin/AdminDashboard.jsx',
    'src/pages/admin/AdminBikes.jsx',
    'src/pages/admin/AdminPayments.jsx',
    'src/pages/admin/AdminTenantDetail.jsx'
];

filesToFix.forEach(fp => {
    let content = fs.readFileSync(fp, 'utf8');

    // 1. Restore text-white on bg-indigo-600 buttons
    content = content.replace(/bg-indigo-600([^>]+?)text-gray-900 dark:text-white/g, 'bg-indigo-600$1text-white');
    content = content.replace(/text-gray-900 dark:text-white([^>]+?)bg-indigo-600/g, 'text-white$1bg-indigo-600');
    // Also catch bg-indigo-500 hover cases if any
    
    // 2. Tab Navigation in Layout.jsx ("белая на белом фоне, а должно быть синее")
    if (fp.includes('Layout.jsx')) {
        content = content.replace(/bg-white dark:bg-gray-900 text-gray-900 dark:text-white/g, 'bg-indigo-600 text-white shadow-sm');
        content = content.replace(/bg-gray-200 dark:bg-gray-700 hover:text-gray-900 dark:text-white/g, 'bg-gray-100 dark:bg-gray-700 hover:text-gray-900 dark:hover:text-white');
    }

    // 3. Week/Month/Year tabs in AdminDashboard 
    if (fp.includes('AdminDashboard.jsx')) {
        // Remove bg-gray-50 from rows (all rows should be white background in light mode to not be highlighted)
        content = content.replace(/bg-gray-50 dark:bg-gray-800(?!(\/|\]|-))/g, 'bg-white dark:bg-gray-800');
        content = content.replace(/bg-gray-50\\/50 dark:bg-gray-800\\/50/g, 'bg-transparent dark:bg-transparent');
        content = content.replace(/hover:bg-gray-100 dark:bg-gray-750/g, 'hover:bg-indigo-50 dark:hover:bg-gray-750');
        // Week/Month buttons container
        content = content.replace(/bg-white dark:bg-gray-900 rounded-lg p-1/g, 'bg-gray-100 dark:bg-gray-900 rounded-lg p-1');
        
        // "Кнопки справа убери синий цвет, сделай просто черные кнопки." (Edit icon in tenant list / MoreVertical)
        content = content.replace(/text-indigo-400 dark:text-indigo-500 dark:text-gray-400 hover:text-indigo-600/g, 'text-black dark:text-gray-400 hover:text-black dark:hover:text-white');
        content = content.replace(/text-indigo-400 hover:text-indigo-600/g, 'text-black dark:text-gray-400 hover:text-black dark:hover:text-white');
        
        // "первый велосипедист выделен каким-то серым цветом, он не должен быть выделен"
        content = content.replace(/bg-gray-100 dark:bg-gray-750/g, ''); // Removes default highlight

        // "Галочки статус оплачено очень тусклые" -> Make CheckCircle green and bright
        content = content.replace(/text-gray-400 dark:text-gray-500 dark:text-gray-400/g, 'text-gray-400');
        content = content.replace(/text-gray-300 dark:text-gray-400/g, 'text-gray-400');
        content = content.replace(/border-gray-300/g, 'border-gray-200');
        content = content.replace(/border-gray-400/g, 'border-gray-200');
    }

    // 4. AdminBikes.jsx
    if (fp.includes('AdminBikes.jsx')) {
        content = content.replace(/bg-gray-50 dark:bg-gray-800/g, 'bg-white dark:bg-gray-800');
    }

    // 5. General sweeping fixes for the over-zealous dark-mode converter
    content = content.replace(/dark:text-gray-500 dark:text-gray-400/g, 'dark:text-gray-400');
    content = content.replace(/dark:text-gray-400 dark:text-white/g, 'dark:text-white');
    content = content.replace(/hover:bg-gray-50 dark:bg-gray-800/g, 'hover:bg-gray-50 dark:hover:bg-gray-800');
    content = content.replace(/dark:bg-gray-700 hover:text-gray-900 dark:text-white/g, 'dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white');

    fs.writeFileSync(fp, content, 'utf8');
});
