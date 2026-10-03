// Constants
        const DRUM_RATE = 12;
        const BAG_RATE = 8;
        
        // Global variables
        let currentDate = null;
        let totalEntries = 0;
        let currentEntry = 0;
        let entries = [];
        let excelData = [
            ["Date", "Drums", "Bags", "Total (Rs)", "A.Ditta", "A.Yar", "Saleem", "Nazir", "Waseem"]
        ];
        let backupDocument = null;
        let backupWriteQueue = Promise.resolve();
        let backupReady = false;
        
        // Variable to track entry being edited
        let editingIndex = -1;
        
        // Initialize
        document.addEventListener('DOMContentLoaded', async function() {
            // Set current year in footer
            document.getElementById('currentYear').textContent = new Date().getFullYear();

            await initializeFirebaseBackup();
            
            // Initialize status bar
            updateStatusBar();
            
            // Initialize step indicator
            updateStepIndicator();
            
            // Setup auto-focus for inputs
            setupAutoFocus();
        });

        async function initializeFirebaseBackup() {
            try {
                if (!window.firebase) {
                    throw new Error("Firebase SDK could not be loaded. Check your internet connection.");
                }

                const firebaseConfig = {
                    apiKey: "AIzaSyCuJpdRvOed7jZOu2sIHIVEJ3Ay7mZEgjU",
                    authDomain: "login-check-b8ea2.firebaseapp.com",
                    projectId: "login-check-b8ea2",
                    storageBucket: "login-check-b8ea2.firebasestorage.app",
                    messagingSenderId: "651024024981",
                    appId: "1:651024024981:web:73d7c14ae54435d014e29c",
                    measurementId: "G-354VY177SB"
                };

                const app = firebase.apps.length
                    ? firebase.app()
                    : firebase.initializeApp(firebaseConfig);
                backupDocument = app.firestore().collection("billingBackups").doc("active");

                const backupSnapshot = await backupDocument.get();
                if (backupSnapshot.exists) {
                    restoreBackup(backupSnapshot.data());
                    showNotification("Previous billing data restored from Firebase.", "success");
                }
            } catch (error) {
                backupDocument = null;
                showNotification(`Firebase backup could not be loaded: ${error.message}`, "error");
            } finally {
                backupReady = true;
            }
        }

        function ensureBackupReady() {
            if (!backupReady) {
                showNotification("Firebase is still loading. Please try again in a moment.", "info");
                return false;
            }
            return true;
        }

        function restoreBackup(backup) {
            if (!backup || !Array.isArray(backup.entries) ||
                typeof backup.totalEntries !== "number" ||
                typeof backup.currentEntry !== "number" ||
                backup.totalEntries < 0 ||
                backup.currentEntry < 0 ||
                !backup.entries.every(entry =>
                    entry &&
                    typeof entry.date === "string" &&
                    /^\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/.test(entry.date) &&
                    typeof entry.drums === "number" &&
                    typeof entry.bags === "number" &&
                    typeof entry.total === "number" &&
                    Array.isArray(entry.persons) &&
                    entry.persons.every(person =>
                        ["A.Ditta", "A.Yar", "Saleem", "Nazir", "Waseem"].includes(person)) &&
                    typeof entry.ad === "string" &&
                    typeof entry.ay === "string" &&
                    typeof entry.sa === "string" &&
                    typeof entry.na === "string" &&
                    typeof entry.wa === "string") ||
                (backup.currentDate !== null &&
                    (!backup.currentDate ||
                        typeof backup.currentDate.day !== "number" ||
                        typeof backup.currentDate.month !== "number" ||
                        typeof backup.currentDate.year !== "number" ||
                        backup.currentDate.day < 1 ||
                        backup.currentDate.day > 31 ||
                        backup.currentDate.month < 1 ||
                        backup.currentDate.month > 12))) {
                throw new Error("The saved billing backup has an invalid format.");
            }

            entries = backup.entries;
            totalEntries = backup.totalEntries;
            currentEntry = backup.currentEntry;
            currentDate = backup.currentDate;
            excelData = [
                ["Date", "Drums", "Bags", "Total (Rs)", "A.Ditta", "A.Yar", "Saleem", "Nazir", "Waseem"],
                ...entries.map(entry => [
                    entry.date, entry.drums, entry.bags, entry.total,
                    entry.ad, entry.ay, entry.sa, entry.na, entry.wa
                ])
            ];
            updateStatusBar();
            updateEntriesTable();
            updateSummary();
            updateStepIndicator();
            updateButtonStates();
            if (currentDate) {
                updateDateDisplayWindow();
            }
        }

        function saveBackup() {
            if (!backupDocument) {
                showNotification("Firebase backup is unavailable. Check Firebase setup and Firestore access rules.", "error");
                return Promise.resolve(false);
            }

            const backup = {
                entries: entries.map(entry => ({
                    ...entry,
                    persons: [...entry.persons]
                })),
                totalEntries,
                currentEntry,
                currentDate: currentDate ? { ...currentDate } : null
            };

            backupWriteQueue = backupWriteQueue.then(async function() {
                try {
                    await backupDocument.set(backup);
                    return true;
                } catch (error) {
                    showNotification(`Firebase backup could not be saved: ${error.message}`, "error");
                    return false;
                }
            });

            return backupWriteQueue;
        }

        async function clearBackup() {
            if (!backupDocument) {
                showNotification("Excel was generated, but Firebase backup could not be cleared because Firebase is unavailable.", "error");
                return false;
            }

            await backupWriteQueue;
            try {
                await backupDocument.delete();
                return true;
            } catch (error) {
                showNotification(`Excel was generated, but Firebase backup could not be cleared: ${error.message}`, "error");
                return false;
            }
        }
        
        // Setup auto-focus functionality
        function setupAutoFocus() {
            const drumsInputWindow = document.getElementById('drumsInputWindow');
            const bagsInputWindow = document.getElementById('bagsInputWindow');

            bagsInputWindow.addEventListener('input', updateCalculationWindow);
            drumsInputWindow.addEventListener('input', updateCalculationWindow);

            const enterActions = {
                totalEntriesInput: setEntries,
                yearInput: saveDate,
                customDayInput: useCustomDate,
                bagsInputWindow: addEntryFromWindow,
                waCheckboxWindow: addEntryFromWindow
            };

            document.addEventListener('keydown', function(event) {
                if (event.key !== 'Enter' || !(event.target instanceof HTMLElement)) {
                    return;
                }

                const currentField = event.target;
                if (!currentField.matches('input, textarea, select') ||
                    currentField.matches('input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"]') ||
                    currentField.disabled || currentField.readOnly) {
                    return;
                }

                event.preventDefault();

                const activeWindow = document.querySelector('.step-window.active');
                const scope = activeWindow || document;
                const fields = Array.from(scope.querySelectorAll('input, textarea, select')).filter(field =>
                    !field.disabled &&
                    !field.readOnly &&
                    !field.matches('input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"]') &&
                    field.getClientRects().length > 0
                );
                const currentIndex = fields.indexOf(currentField);

                if (enterActions[currentField.id]) {
                    enterActions[currentField.id]();
                } else if (currentIndex >= 0 && currentIndex < fields.length - 1) {
                    fields[currentIndex + 1].focus();
                }
            });
        }
        
        // Open window
        function openWindow(windowId) {
            const isStep3Screen = windowId === 'step3Window';
            document.getElementById('windowOverlay').classList.toggle('active', !isStep3Screen);
            document.body.classList.toggle('screen-open', isStep3Screen);
            document.getElementById(windowId).classList.add('active');
            
            // Focus on first input
            setTimeout(() => {
                if (windowId === 'step1Window') {
                    document.getElementById('totalEntriesInput').focus();
                } else if (windowId === 'step2Window') {
                    document.getElementById('dayInput').focus();
                } else if (windowId === 'step3Window') {
                    document.getElementById('drumsInputWindow').focus();
                    updateDateDisplayWindow();
                }
            }, 100);
        }
        
        // Close window
        function closeWindow(windowId) {
            document.getElementById('windowOverlay').classList.remove('active');
            document.body.classList.remove('screen-open');
            document.getElementById(windowId).classList.remove('active');
            
            // Reset form if closing step 3 window
            if (windowId === 'step3Window') {
                resetCurrentEntryWindow();
                editingIndex = -1;
                updateButtonStates();
            }
        }
        
        // Update step indicator
        function updateStepIndicator() {
            // Enable/disable step buttons based on state
            const step2Btn = document.getElementById('step2Btn');
            const step3Btn = document.getElementById('step3Btn');
            
            step2Btn.disabled = totalEntries === 0;
            step3Btn.disabled = currentDate === null;
            
            if (!step2Btn.disabled) {
                step2Btn.style.opacity = '1';
                step2Btn.style.cursor = 'pointer';
            } else {
                step2Btn.style.opacity = '0.6';
                step2Btn.style.cursor = 'not-allowed';
            }
            
            if (!step3Btn.disabled) {
                step3Btn.style.opacity = '1';
                step3Btn.style.cursor = 'pointer';
            } else {
                step3Btn.style.opacity = '0.6';
                step3Btn.style.cursor = 'not-allowed';
            }
            
            // Update visual step indicator
            for (let i = 1; i <= 4; i++) {
                document.getElementById(`step${i}`).className = 'step-circle';
                document.getElementById(`step${i}Label`).className = 'step-label';
                document.getElementById(`step${i}Label`).classList.remove('completed');
            }
            
            // Mark completed steps
            if (totalEntries > 0) {
                document.getElementById(`step1`).classList.add('completed');
                document.getElementById(`step1Label`).classList.add('completed');
            }
            
            if (currentDate !== null) {
                document.getElementById(`step2`).classList.add('completed');
                document.getElementById(`step2Label`).classList.add('completed');
            }
            
            if (entries.length > 0) {
                document.getElementById(`step3`).classList.add('completed');
                document.getElementById(`step3Label`).classList.add('completed');
            }
            
            // Mark active step based on current state
            if (totalEntries === 0) {
                document.getElementById(`step1`).classList.add('active');
                document.getElementById(`step1Label`).classList.add('active');
            } else if (currentDate === null) {
                document.getElementById(`step2`).classList.add('active');
                document.getElementById(`step2Label`).classList.add('active');
            } else {
                document.getElementById(`step3`).classList.add('active');
                document.getElementById(`step3Label`).classList.add('active');
            }
        }
        
        // Update button states
        function updateButtonStates() {
            const generateExcelBtn = document.getElementById('generateExcelBtn');
            
            // Update button text if editing
            const addEntryWindowBtn = document.getElementById('addEntryWindowBtn');
            if (editingIndex >= 0) {
                addEntryWindowBtn.innerHTML = '<i class="fas fa-save"></i> Update Entry';
                addEntryWindowBtn.classList.remove('btn-success');
                addEntryWindowBtn.classList.add('btn-warning');
            } else {
                addEntryWindowBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Entry';
                addEntryWindowBtn.classList.remove('btn-warning');
                addEntryWindowBtn.classList.add('btn-success');
            }
            
            if (entries.length > 0) {
                generateExcelBtn.disabled = false;
                generateExcelBtn.style.opacity = '1';
                generateExcelBtn.style.cursor = 'pointer';
                document.getElementById('step4').classList.add('completed');
                document.getElementById('step4Label').classList.add('completed');
            } else {
                generateExcelBtn.disabled = true;
                generateExcelBtn.style.opacity = '0.6';
                generateExcelBtn.style.cursor = 'not-allowed';
            }
        }
        
        // Update calculation display in window
        function updateCalculationWindow() {
            const drums = parseInt(document.getElementById('drumsInputWindow').value) || 0;
            const bags = parseInt(document.getElementById('bagsInputWindow').value) || 0;
            
            if (drums > 0 || bags > 0) {
                const drumTotal = drums * DRUM_RATE;
                const bagTotal = bags * BAG_RATE;
                const total = drumTotal + bagTotal;
                
                document.getElementById('totalCalculationWindow').style.display = 'block';
                document.getElementById('calculationDetailsWindow').innerHTML = `
                    <div style="color: var(--accent-color);">Drums: ${drums} × Rs.${DRUM_RATE} = Rs.${drumTotal}</div>
                    <div style="color: var(--primary-color); margin-top: 5px;">Bags: ${bags} × Rs.${BAG_RATE} = Rs.${bagTotal}</div>
                    <div style="color: var(--success-color); font-weight: 700; font-size: 1.2rem; margin-top: 10px;">Total: Rs.${total}</div>
                `;
            } else {
                document.getElementById('totalCalculationWindow').style.display = 'none';
            }
        }
        
        // Set entries count - STEP 1
        async function setEntries() {
            if (!ensureBackupReady()) return;

            const entriesInput = document.getElementById('totalEntriesInput').value;
            totalEntries = parseInt(entriesInput);
            
            if (!totalEntries || totalEntries <= 0) {
                showNotification("Please enter a valid number of entries", "error");
                return;
            }
            
            currentEntry = 0;
            entries = [];
            updateStatusBar();
            updateEntriesTable();
            updateSummary();
            const backupSaved = await saveBackup();
            
            // Close window
            closeWindow('step1Window');
            
            // Update step indicator
            updateStepIndicator();
            
            // Show success message
            showNotification(
                backupSaved
                    ? `Set to ${totalEntries} entries. Now set the date.`
                    : "Entries set on this device, but Firebase backup failed.",
                backupSaved ? "success" : "error"
            );
        }
        
        // Save date - STEP 2
        async function saveDate() {
            if (!ensureBackupReady()) return;

            const day = parseInt(document.getElementById('dayInput').value);
            const month = parseInt(document.getElementById('monthInput').value);
            const year = parseInt(document.getElementById('yearInput').value);
            
            if (!day || !month || !year) {
                showNotification("Please enter a complete date (day, month, year)", "error");
                return;
            }
            
            if (day < 1 || day > 31) {
                showNotification("Day must be between 1 and 31", "error");
                return;
            }
            
            if (month < 1 || month > 12) {
                showNotification("Month must be between 1 and 12", "error");
                return;
            }
            
            if (year < 2023 || year > 2030) {
                showNotification("Year must be between 2023 and 2030", "error");
                return;
            }
            
            currentDate = { day, month, year };
            const backupSaved = await saveBackup();
            
            // Close window
            closeWindow('step2Window');
            
            // Update step indicator
            updateStepIndicator();
            
            // Show success message
            showNotification(
                backupSaved
                    ? `Date set to ${day}-${month}-${year}. You can now add entries.`
                    : "Date set on this device, but Firebase backup failed.",
                backupSaved ? "success" : "error"
            );
        }
        
        // Update date display in window
        function updateDateDisplayWindow() {
            if (currentDate) {
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const dateText = `${currentDate.day}-${monthNames[currentDate.month-1]}-${currentDate.year}`;
                document.getElementById('currentDateText').textContent = dateText;
            } else {
                document.getElementById('currentDateText').textContent = 'Not Set';
            }
        }
        
        // Use next date in window
        async function useNextDate() {
            if (!ensureBackupReady()) return;

            if (!currentDate) {
                showNotification("Please set date first", "error");
                return;
            }
            
            currentDate.day++;
            // Simple date validation - in a real app you'd use Date object
            if (currentDate.day > 31) {
                currentDate.day = 1;
                currentDate.month++;
                
                if (currentDate.month > 12) {
                    currentDate.month = 1;
                    currentDate.year++;
                }
            }
            
            updateDateDisplayWindow();
            const backupSaved = await saveBackup();
            showNotification(
                backupSaved ? "Date advanced to next day" : "Date advanced locally, but Firebase backup failed.",
                backupSaved ? "info" : "error"
            );
            
            // Focus on drums input
            setTimeout(() => {
                document.getElementById('drumsInputWindow').focus();
            }, 100);
        }
        
        // Use previous date in window
        async function usePreviousDate() {
            if (!ensureBackupReady()) return;

            if (!currentDate) {
                showNotification("Please set date first", "error");
                return;
            }
            
            currentDate.day--;
            // Simple date validation
            if (currentDate.day < 1) {
                currentDate.day = 31;
                currentDate.month--;
                
                if (currentDate.month < 1) {
                    currentDate.month = 12;
                    currentDate.year--;
                }
            }
            
            updateDateDisplayWindow();
            const backupSaved = await saveBackup();
            showNotification(
                backupSaved ? "Date moved to previous day" : "Date moved locally, but Firebase backup failed.",
                backupSaved ? "info" : "error"
            );
            
            // Focus on drums input
            setTimeout(() => {
                document.getElementById('drumsInputWindow').focus();
            }, 100);
        }
        
        // Use custom date in window
        async function useCustomDate() {
            if (!ensureBackupReady()) return;

            if (!currentDate) {
                showNotification("Please set date first", "error");
                return;
            }
            
            const customDay = parseInt(document.getElementById('customDayInput').value);
            if (!customDay || customDay < 1 || customDay > 31) {
                showNotification("Please enter a valid day (1-31)", "error");
                return;
            }
            
            currentDate.day = customDay;
            updateDateDisplayWindow();
            const backupSaved = await saveBackup();
            showNotification(
                backupSaved ? `Date changed to day ${customDay}` : "Date changed locally, but Firebase backup failed.",
                backupSaved ? "info" : "error"
            );
            
            // Focus on drums input
            setTimeout(() => {
                document.getElementById('drumsInputWindow').focus();
            }, 100);
            
            // Clear custom day input
            document.getElementById('customDayInput').value = '';
        }
        
        // Select all persons in window
        function selectAllPersonsWindow() {
            document.getElementById('adCheckboxWindow').checked = true;
            document.getElementById('ayCheckboxWindow').checked = true;
            document.getElementById('saCheckboxWindow').checked = true;
            document.getElementById('naCheckboxWindow').checked = true;
            document.getElementById('waCheckboxWindow').checked = true;
        }
        
        // Clear all persons in window
        function clearAllPersonsWindow() {
            document.getElementById('adCheckboxWindow').checked = false;
            document.getElementById('ayCheckboxWindow').checked = false;
            document.getElementById('saCheckboxWindow').checked = false;
            document.getElementById('naCheckboxWindow').checked = false;
            document.getElementById('waCheckboxWindow').checked = false;
        }

        function selectThreePersonsWindow() {
            clearAllPersonsWindow();
            document.getElementById('saCheckboxWindow').checked = true;
            document.getElementById('naCheckboxWindow').checked = true;
            document.getElementById('waCheckboxWindow').checked = true;
        }
        
        // Reset current entry form in window
        function resetCurrentEntryWindow() {
            document.getElementById('drumsInputWindow').value = '';
            document.getElementById('bagsInputWindow').value = '';
            document.getElementById('customDayInput').value = '';
            document.getElementById('totalCalculationWindow').style.display = 'none';
            clearAllPersonsWindow();
            editingIndex = -1;
            updateButtonStates();
            showNotification("Form reset for new entry", "info");
            
            // Focus on drums input
            setTimeout(() => {
                document.getElementById('drumsInputWindow').focus();
            }, 100);
        }
        
        // Edit an entry
        function editEntry(index) {
            if (!ensureBackupReady()) return;
            if (index < 0 || index >= entries.length) return;
            
            const entry = entries[index];
            editingIndex = index;
            
            // Open step 3 window
            openWindow('step3Window');
            
            // Parse date from entry
            const dateParts = entry.date.split('-');
            if (dateParts.length === 3) {
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const monthIndex = monthNames.indexOf(dateParts[1]);
                if (monthIndex !== -1) {
                    currentDate = {
                        day: parseInt(dateParts[0]),
                        month: monthIndex + 1,
                        year: parseInt(dateParts[2])
                    };
                    updateDateDisplayWindow();
                }
            }
            
            // Fill form with entry data
            document.getElementById('drumsInputWindow').value = entry.drums;
            document.getElementById('bagsInputWindow').value = entry.bags;
            
            // Set checkboxes based on persons
            document.getElementById('adCheckboxWindow').checked = entry.persons.includes("A.Ditta");
            document.getElementById('ayCheckboxWindow').checked = entry.persons.includes("A.Yar");
            document.getElementById('saCheckboxWindow').checked = entry.persons.includes("Saleem");
            document.getElementById('naCheckboxWindow').checked = entry.persons.includes("Nazir");
            document.getElementById('waCheckboxWindow').checked = entry.persons.includes("Waseem");
            
            // Update calculation display
            updateCalculationWindow();
            
            showNotification(`Editing entry ${index + 1}. Click "Update Entry" to save changes.`, 'info');
        }
        
        // Delete an entry
        async function deleteEntry(index) {
            if (!ensureBackupReady()) return;

            if (confirm(`Are you sure you want to delete entry ${index + 1}?`)) {
                // Remove from entries array
                entries.splice(index, 1);
                
                // Rebuild excelData
                excelData = [excelData[0]]; // Keep header
                entries.forEach(entry => {
                    excelData.push([entry.date, entry.drums, entry.bags, entry.total, entry.ad, entry.ay, entry.sa, entry.na, entry.wa]);
                });
                
                // Update counters
                currentEntry = entries.length;
                
                // Update UI
                updateStatusBar();
                updateEntriesTable();
                updateSummary();
                updateButtonStates();
                updateStepIndicator();
                const backupSaved = await saveBackup();
                
                // Reset editing if deleted entry was being edited
                if (editingIndex === index) {
                    editingIndex = -1;
                    closeWindow('step3Window');
                } else if (editingIndex > index) {
                    editingIndex--;
                }
                
                showNotification(
                    backupSaved
                        ? `Entry ${index + 1} deleted successfully`
                        : `Entry ${index + 1} deleted locally, but Firebase backup failed.`,
                    backupSaved ? "success" : "error"
                );
            }
        }
        
        // Add or Update entry from window
        async function addEntryFromWindow() {
            if (!ensureBackupReady()) return;

            // Validate total entries set
            if (totalEntries <= 0) {
                showNotification("Please set the total number of entries first", "error");
                openWindow('step1Window');
                return;
            }
            
            // Validate date
            if (!currentDate) {
                showNotification("Please save a date first", "error");
                openWindow('step2Window');
                return;
            }
            
            // Validate items
            const drums = parseInt(document.getElementById('drumsInputWindow').value) || 0;
            const bags = parseInt(document.getElementById('bagsInputWindow').value) || 0;
            
            if (drums === 0 && bags === 0) {
                showNotification("Please enter at least one item (drums or bags)", "error");
                setTimeout(() => {
                    document.getElementById('drumsInputWindow').focus();
                }, 100);
                return;
            }
            
            // Validate persons selected
            const persons = [];
            if (document.getElementById('adCheckboxWindow').checked) persons.push("A.Ditta");
            if (document.getElementById('ayCheckboxWindow').checked) persons.push("A.Yar");
            if (document.getElementById('saCheckboxWindow').checked) persons.push("Saleem");
            if (document.getElementById('naCheckboxWindow').checked) persons.push("Nazir");
            if (document.getElementById('waCheckboxWindow').checked) persons.push("Waseem");
            
            if (persons.length === 0) {
                showNotification("Please select at least one person", "error");
                return;
            }
            
            // Calculate totals
            const total = (drums * DRUM_RATE) + (bags * BAG_RATE);
            const share = persons.length > 0 ? (total / persons.length).toFixed(2) : 0;
            
            // Format date nicely
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const formattedDate = `${currentDate.day}-${monthNames[currentDate.month-1]}-${currentDate.year}`;
            
            // Prepare entry
            const entry = {
                date: formattedDate,
                drums,
                bags,
                total,
                persons,
                share,
                ad: persons.includes("A.Ditta") ? share : "-",
                ay: persons.includes("A.Yar") ? share : "-",
                sa: persons.includes("Saleem") ? share : "-",
                na: persons.includes("Nazir") ? share : "-",
                wa: persons.includes("Waseem") ? share : "-"
            };
            const savedEntryNumber = editingIndex >= 0 ? editingIndex + 1 : currentEntry + 1;
            
            if (editingIndex >= 0) {
                // Update existing entry
                entries[editingIndex] = entry;
                
                // Update excelData
                excelData[editingIndex + 1] = [entry.date, entry.drums, entry.bags, entry.total, entry.ad, entry.ay, entry.sa, entry.na, entry.wa];
                
                // Reset editing
                editingIndex = -1;
            } else {
                // Add new entry
                
                // Check if we have reached total entries
                if (currentEntry >= totalEntries) {
                    showNotification("All entries have been completed. You can still add more but total entries count won't increase.", "info");
                }
                
                // Add to entries array
                entries.push(entry);
                
                // Add to Excel data
                excelData.push([entry.date, entry.drums, entry.bags, entry.total, entry.ad, entry.ay, entry.sa, entry.na, entry.wa]);
                
                // Update counters
                currentEntry++;
                
            }
            
            // Update UI
            updateStatusBar();
            updateEntriesTable();
            updateSummary();
            updateButtonStates();
            updateStepIndicator();
            const backupSaved = await saveBackup();
            showNotification(
                backupSaved
                    ? `Entry ${savedEntryNumber} saved successfully`
                    : "Entry saved on this device, but Firebase backup failed.",
                backupSaved ? "success" : "error"
            );
            
            // Clear form for next entry
            resetCurrentEntryWindow();
        }
        
        // Update status bar
        function updateStatusBar() {
            document.getElementById('totalEntriesValue').textContent = totalEntries;
            document.getElementById('currentEntryValue').textContent = currentEntry;
            document.getElementById('remainingEntriesValue').textContent = totalEntries - currentEntry;
            
            // Add animation when values change
            document.querySelectorAll('.status-value').forEach(el => {
                el.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    el.style.transform = 'scale(1)';
                }, 300);
            });
        }
        
        // Update entries table
        function updateEntriesTable() {
            const tableBody = document.getElementById('entriesTableBody');
            const emptyMessage = document.getElementById('emptyEntriesMessage');
            const table = document.getElementById('entriesTable');
            
            if (entries.length === 0) {
                emptyMessage.style.display = 'block';
                table.style.display = 'none';
                document.getElementById('summaryCard').style.display = 'none';
                document.getElementById('emptySummaryMessage').style.display = 'block';
                return;
            }
            
            emptyMessage.style.display = 'none';
            table.style.display = 'table';
            document.getElementById('summaryCard').style.display = 'block';
            document.getElementById('emptySummaryMessage').style.display = 'none';
            
            // Clear table
            tableBody.innerHTML = '';
            
            // Add entries
            entries.forEach((entry, index) => {
                const row = document.createElement('tr');
                
                // Add subtle animation
                row.style.opacity = '0';
                row.style.transform = 'translateY(10px)';
                setTimeout(() => {
                    row.style.opacity = '1';
                    row.style.transform = 'translateY(0)';
                    row.style.transition = 'all 0.3s ease';
                }, index * 50);
                
                row.innerHTML = `
                    <td><strong>${entry.date}</strong></td>
                    <td>${entry.drums}</td>
                    <td>${entry.bags}</td>
                    <td class="highlight">Rs.${entry.total}</td>
                    <td>${entry.persons.join(', ')}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn edit-btn" onclick="editEntry(${index})">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteEntry(${index})">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
        }
        
        // Update summary
        function updateSummary() {
            if (entries.length === 0) {
                return;
            }
            
            // Calculate totals
            let totalDrums = 0;
            let totalBags = 0;
            let totalAmount = 0;
            
            entries.forEach(entry => {
                totalDrums += entry.drums;
                totalBags += entry.bags;
                totalAmount    
                += entry.total;
            });
            
            // Update summary content
            const summaryContent = document.getElementById('summaryContent');
            summaryContent.innerHTML = `
                <div class="summary-item">
                    <div class="summary-value">${totalDrums}</div>
                    <div class="summary-label">Total Drums</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${totalBags}</div>
                    <div class="summary-label">Total Bags</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${entries.length}</div>
                    <div class="summary-label">Total Entries</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">Rs.${totalAmount}</div>
                    <div class="summary-label">Total Amount</div>
                </div>
            `;
        }
        
        // Generate Excel with totals row
        async function generateExcel() {
            if (!ensureBackupReady()) return;

            if (entries.length === 0) {
                showNotification("No entries to export", "error");
                return;
            }
            
            if (currentEntry < totalEntries) {
                const confirmExport = confirm(`You have completed ${currentEntry} out of ${totalEntries} entries. Do you want to export anyway?`);
                if (!confirmExport) {
                    return;
                }
            }
            
            // Create workbook
            const wb = XLSX.utils.book_new();
            
            // Calculate totals for Excel
            let totalDrums = 0;
            let totalBags = 0;
            let totalAmount = 0;
            let totalAD = 0;
            let totalAY = 0;
            let totalSA = 0;
            let totalNA = 0;
            let totalWA = 0;
            
            entries.forEach(entry => {
                totalDrums += entry.drums;
                totalBags += entry.bags;
                totalAmount += entry.total;
                
                // Calculate person totals (only if they have share)
                if (entry.ad !== "-") totalAD += parseFloat(entry.ad);
                if (entry.ay !== "-") totalAY += parseFloat(entry.ay);
                if (entry.sa !== "-") totalSA += parseFloat(entry.sa);
                if (entry.na !== "-") totalNA += parseFloat(entry.na);
                if (entry.wa !== "-") totalWA += parseFloat(entry.wa);
            });
            
            // Prepare Excel data with totals row at the end
            const excelDataWithTotals = [
                ["Date", "Drums", "Bags", "Total (Rs)", "A.Ditta", "A.Yar", "Saleem", "Nazir", "Waseem"]
            ];
            
            // Add all entries
            entries.forEach(entry => {
                excelDataWithTotals.push([
                    entry.date,
                    entry.drums,
                    entry.bags,
                    entry.total,
                    entry.ad,
                    entry.ay,
                    entry.sa,
                    entry.na,
                    entry.wa
                ]);
            });
            
            // Add empty row for separation
            excelDataWithTotals.push(["", "", "", "", "", "", "", "", ""]);
            
            // Add totals row with proper formatting
            excelDataWithTotals.push([
                "TOTAL",
                totalDrums,
                totalBags,
                totalAmount,
                totalAD.toFixed(2),
                totalAY.toFixed(2),
                totalSA.toFixed(2),
                totalNA.toFixed(2),
                totalWA.toFixed(2)
            ]);
            
            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet(excelDataWithTotals);
            
            // Apply styling to totals row (bold)
            const lastRowIndex = excelDataWithTotals.length - 1; // Totals row
            const secondLastRowIndex = lastRowIndex - 1; // Empty row before totals
            
            // Make totals row bold
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({r: secondLastRowIndex, c: C});
                if (ws[cellAddress]) {
                    ws[cellAddress].s = { font: { bold: true } };
                }
            }
            
            // Make summary row bold too
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({r: lastRowIndex, c: C});
                if (ws[cellAddress]) {
                    ws[cellAddress].s = { font: { bold: true } };
                }
            }
            
            // Set column widths for better visibility
            const colWidths = [
                {wch: 15}, // Date
                {wch: 10}, // Drums
                {wch: 10}, // Bags
                {wch: 15}, // Total
                {wch: 12}, // A.Ditta
                {wch: 12}, // A.Yar
                {wch: 12}, // Saleem
                {wch: 12}, // Nazir
                {wch: 12}  // Waseem
            ];
            ws['!cols'] = colWidths;
            
            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, "Loading Bill");
            
            // Generate file name with timestamp
            let num = Math.floor(Math.random() * 900) + 100;
            const fileName = `Loading_bill_created_by_yaseen_web_serial_${num}.xlsx`;
            
            // Save file
            try {
                XLSX.writeFile(wb, fileName);
            } catch (error) {
                showNotification(`Excel file could not be generated: ${error.message}`, "error");
                return;
            }

            if (!await clearBackup()) {
                return;
            }

            totalEntries = 0;
            currentEntry = 0;
            currentDate = null;
            entries = [];
            excelData = [excelData[0]];
            updateStatusBar();
            updateEntriesTable();
            updateSummary();
            updateDateDisplayWindow();
            updateStepIndicator();
            updateButtonStates();
            
            showNotification(`Excel file "${fileName}" generated. Firebase backup cleared and billing data reset.`, 'success');
            
            // Mark step 4 as completed
            document.getElementById('step4').classList.add('completed');
            document.getElementById('step4Label').classList.add('completed');
        }
        
        // Show notification
        function showNotification(message, type) {
            // Create notification element
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 25px;
                right: 25px;
                padding: 18px 28px;
                border-radius: 12px;
                color: white;
                font-weight: 700;
                font-size: 1.05rem;
                z-index: 1100;
                box-shadow: 0 8px 25px rgba(0,0,0,0.2);
                animation: slideIn 0.4s ease;
                max-width: 400px;
                line-height: 1.5;
                border-left: 6px solid rgba(255,255,255,0.3);
            `;
            
            // Set color based on type
            if (type === 'success') {
                notification.style.background = 'linear-gradient(135deg, var(--success-color), #38A169)';
                notification.style.borderLeftColor = '#2F855A';
            } else if (type === 'error') {
                notification.style.background = 'linear-gradient(135deg, var(--error-color), #E53E3E)';
                notification.style.borderLeftColor = '#C53030';
            } else if (type === 'info') {
                notification.style.background = 'linear-gradient(135deg, var(--secondary-color), #5BA8FF)';
                notification.style.borderLeftColor = '#3A94FF';
            } else {
                notification.style.background = 'linear-gradient(135deg, var(--accent-color), #4C51BF)';
                notification.style.borderLeftColor = '#434190';
            }
            
            // Add to page
            document.body.appendChild(notification);
            
            // Remove after 4 seconds
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.4s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        document.body.removeChild(notification);
                    }
                }, 400);
            }, 4000);

        }
