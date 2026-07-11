const fs = require('fs');

const filesToFix = [
    'src/components/Layout.jsx',
    'src/pages/admin/AdminDashboard.jsx',
    'src/pages/admin/AdminBikes.jsx',
    'src/pages/admin/AdminPayments.jsx',
    'src/pages/admin/AdminTenantDetail.jsx'
];

filesToFix.forEach(fp => {
    if (!fs.existsSync(fp)) return;
    let content = fs.readFileSync(fp, 'utf8');

    // Restore text-white in bg-indigo-600 buttons where script messed it up
    content = content.replace(/bg-indigo-60[0-9] hover:bg-indigo-[0-9]+ text-gray-900 dark:text-white/g, 'bg-indigo-600 hover:bg-indigo-700 text-white');
    content = content.replace(/bg-indigo-60[0-9] text-gray-900 dark:text-white/g, 'bg-indigo-600 text-white');
    content = content.replace(/text-gray-900 dark:text-white hover:bg-gray-50 dark:bg-gray-800 rounded-md transition-colors\s*`}/g, 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors`}');
    
    // Layout.jsx tabs
    content = content.replace(/bg-white dark:bg-gray-900 text-gray-900 dark:text-white/g, 'bg-indigo-600 text-white shadow-sm');
    
    // AdminDashboard fixes
    content = content.replace(/bg-gray-50 dark:bg-gray-800/g, 'bg-white dark:bg-gray-800');
    content = content.replace(/bg-gray-50\/50/g, 'bg-white');
    content = content.replace(/hover:bg-gray-100 dark:bg-gray-750/g, 'hover:bg-indigo-50 dark:hover:bg-gray-750');
    content = content.replace(/bg-white dark:bg-gray-900 rounded-lg p-1/g, 'bg-gray-100 dark:bg-gray-900 rounded-lg p-1');
    content = content.replace(/text-indigo-400 dark:text-indigo-500/g, 'text-black dark:text-indigo-400');
    content = content.replace(/text-indigo-400 hover:text-indigo-600/g, 'text-black hover:text-gray-900 dark:text-indigo-400 dark:hover:text-indigo-300');
    content = content.replace(/text-gray-400 dark:text-gray-500 dark:text-gray-400/g, 'text-gray-500 dark:text-gray-400');
    content = content.replace(/border-gray-300/g, 'border-gray-200');
    
    // CheckCircle icons in Dashboard
    content = content.replace(/<CheckCircle className="w-5 h-5 text-gray-400 dark:text-gray-500/g, '<CheckCircle className="w-5 h-5 text-green-500');
    content = content.replace(/<CheckCircle className="w-5 h-5 text-green-400/g, '<CheckCircle className="w-5 h-5 text-green-500');

    content = content.replace(/text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800'}/g, "text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700'}");
    content = content.replace(/bg-indigo-600 text-gray-900 dark:text-white/g, 'bg-indigo-600 text-white');

    fs.writeFileSync(fp, content, 'utf8');
});
