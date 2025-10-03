
// This script runs in a separate thread and won't block the UI.
// We need to import the xlsx library here.
self.importScripts('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js');

self.onmessage = function(event) {
    const file = event.data;
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = self.XLSX.read(data, { type: 'array' });

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Using sheet_to_json with header: 1 gives an array of arrays
            const json = self.XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (json.length < 2) {
                // Not enough data (at least header + 1 row)
                 self.postMessage({ success: true, data: [], headers: json[0] || [] });
                return;
            }

            const headers = json[0];
            const dataRows = json.slice(1).map((row) => {
                const rowData = {};
                headers.forEach((header, index) => {
                    rowData[header] = row[index] !== undefined ? row[index] : ''; // Ensure no undefined values
                });
                return rowData;
            });
            
            self.postMessage({ success: true, data: dataRows, headers: headers });

        } catch (error) {
            self.postMessage({ success: false, error: error.message });
        }
    };

    reader.onerror = function(e) {
        self.postMessage({ success: false, error: 'Error reading file' });
    }

    reader.readAsArrayBuffer(file);
};
