// Simplified translations object (English only)
var uiText = {
    title: "Telegram Bypass",
    enterChannel: "Channel Username",
    byApi: "By API",
    byBinarySearch: "Binary Search",
    loadChannel: "Open Channel",
    loading: "Connecting...",
    loadingLatestPost: "Finding latest post...",
    startingBinarySearch: "Initializing search...",
    searchingInitialRange: "Scanning range...",
    testingMessage: "Checking ID",
    rangeFound: "Range detected:",
    verifyingLastMessage: "Verifying:",
    noValidMessages: "No valid messages found",
    noMessages: "Channel not found or empty",
    currentlyViewing: "Viewing:",
    latestPostId: "Last ID:",
    searchCompleted: "Done. Last ID:",
    loadMore: "Load Older Messages",
    invalidChannel: "Invalid channel name"
};

const CONFIG = {
    NUM_POSTS: 25,
    CACHE_DURATION: 600000, 
    TIMEOUT_DURATION: 5000,
    MIN_IFRAME_HEIGHT: 60,
    MAX_POSTS_BEFORE_CLEAR: 200,
    INTERVAL_CHECKS: 25,
    LOAD_MORE_POST: 10,
    DELETED_POST_CHECK_MAX_TIMES: 1500,
    DELETED_POST_CHECK_INTERVAL: 10,
    WIDGET_SCRIPT_URL: 'https://telegram.org/js/telegram-widget.js?22',
    API_URL: 'https://api-telegram.repostea.com/api/v2/telegram/channels/{channel}/messages/last-id',
    LOAD_MORE_DELAY: 900
};

const state = {
    countInterval: 0,
    intervalId: null,
    countPosts: 0,
    lastPostId: 0,
    currentChannel: '',
    isLoading: false
};

const elements = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    currentChannel: document.getElementById('current-channel'),
    widgetContainer: document.getElementById('widget-container'),
    loadMoreButton: document.getElementById('loadMoreBtn'),
    channelInput: document.getElementById('channel-input'),
    loadChannelBtn: document.getElementById('load-channel-btn')
};

const postCache = new Map();

const utils = {
    extractChannelName(input) {
        const cleanInput = input.trim();
        if (cleanInput.includes('t.me/')) {
            const parts = cleanInput.split('/');
            return parts[parts.length - 1] || parts[parts.length - 2];
        }
        return cleanInput.startsWith('@') ? cleanInput.substring(1) : cleanInput;
    },
    setLoadingState(isLoading, message = 'Loading...') {
        state.isLoading = isLoading;
        elements.loading.textContent = message;
        elements.loading.style.display = isLoading ? 'block' : 'none';
    },
    showError(message) {
        elements.error.textContent = message;
        elements.error.style.display = 'block';
        elements.loading.style.display = 'none';
    },
    clearContainer() {
        elements.widgetContainer.innerHTML = '';
        elements.loadMoreButton.style.display = 'none';
        elements.currentChannel.style.display = 'none';
    },
    createTestElement() {
        const testContainer = document.createElement('div');
        Object.assign(testContainer.style, {
            position: 'absolute',
            left: '-9999px',
            visibility: 'hidden'
        });
        document.body.appendChild(testContainer);
        return testContainer;
    },
    saveChannel(channelName) {
        const savedChannels = JSON.parse(localStorage.getItem('telegramSavedChannels') || '[]');
        if (!savedChannels.includes(channelName)) {
            savedChannels.push(channelName);
            localStorage.setItem('telegramSavedChannels', JSON.stringify(savedChannels));
            return true;
        }
        return false;
    },
    loadSavedChannels() {
        return JSON.parse(localStorage.getItem('telegramSavedChannels') || '[]');
    },
    removeChannel(channelName) {
        let savedChannels = utils.loadSavedChannels();
        savedChannels = savedChannels.filter(ch => ch !== channelName);
        localStorage.setItem('telegramSavedChannels', JSON.stringify(savedChannels));
    },
    displaySavedChannels() {
        const savedChannels = utils.loadSavedChannels();
        const listContainer = document.getElementById('saved-channels-list');
        const savedChannelsContainer = document.querySelector('.saved-channels');

        if (savedChannels.length > 0) {
            listContainer.innerHTML = '';
            savedChannels.forEach(channel => {
                const li = document.createElement('li');
                li.className = "flex justify-between items-center px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer group";
                li.innerHTML = `
                    <div class="flex items-center gap-3 w-full" data-channel="${channel}">
                        <div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-xs uppercase">
                            ${channel.substring(0, 2)}
                        </div>
                        <span class="text-gray-700 font-medium">@${channel}</span>
                    </div>
                    <button class="remove-channel text-gray-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all" data-channel="${channel}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                `;
                listContainer.appendChild(li);
            });

            savedChannelsContainer.style.display = 'block';

            document.querySelectorAll('.remove-channel').forEach(button => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const channelToRemove = e.currentTarget.dataset.channel;
                    utils.removeChannel(channelToRemove);
                    utils.displaySavedChannels();
                });
            });

            document.querySelectorAll('#saved-channels-list li > div').forEach(div => {
                div.addEventListener('click', (e) => {
                    elements.channelInput.value = e.currentTarget.dataset.channel;
                    elements.loadChannelBtn.click();
                });
            });
        } else {
            savedChannelsContainer.style.display = 'none';
        }
    }
};

const cache = {
    get(channel) {
        const cached = postCache.get(channel);
        if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_DURATION) {
            return cached.value;
        }
        postCache.delete(channel);
        return null;
    },
    set(channel, value) {
        postCache.set(channel, {
            value,
            timestamp: Date.now()
        });
    }
};

const messageChecker = {
    async checkExists(channelName, messageId) {
        return new Promise((resolve) => {
            const testContainer = utils.createTestElement();
            let isResolved = false;

            const cleanup = () => {
                if (!isResolved) {
                    isResolved = true;
                    testContainer.remove();
                }
            };

            const resolveWith = (result) => {
                if (!isResolved) {
                    cleanup();
                    resolve(result);
                }
            };

            const timeout = setTimeout(() => resolveWith(false), CONFIG.TIMEOUT_DURATION);

            const script = document.createElement('script');
            script.async = true;
            script.src = CONFIG.WIDGET_SCRIPT_URL;
            script.setAttribute('data-telegram-post', `${channelName}/${messageId}`);
            script.setAttribute('data-width', '100%');

            const verifyIframe = () => {
                const iframe = testContainer.querySelector('iframe');
                const exists = iframe && iframe.offsetHeight >= CONFIG.MIN_IFRAME_HEIGHT;
                clearTimeout(timeout);
                resolveWith(exists);
            };

            script.onload = () => {
                const iframe = testContainer.querySelector('iframe');
                if (iframe) {
                    iframe.onload = verifyIframe;
                    setTimeout(verifyIframe, CONFIG.LOAD_MORE_DELAY);
                } else {
                    resolveWith(false);
                }
            };

            script.onerror = () => resolveWith(false);
            testContainer.appendChild(script);
        });
    }
};

const binarySearch = {
    testValues: [
        1000020, 1000000, 999980,
        500020, 500000, 499980,
        100020, 100000, 99980,
        80020, 80000, 79980,
        60020, 60000, 59980,
        40020, 40000, 39980,
        20020, 20000, 19980,
        10020, 10000, 9980,
        1020, 1000, 980,
        120, 100, 80
    ],
    updateInfo(message) {
        elements.currentChannel.innerHTML = message;
        elements.currentChannel.style.display = 'block';
    },
    async findLastPost(channelName) {
        const cachedResult = cache.get(channelName);
        if (cachedResult) {
            binarySearch.displayResult(channelName, cachedResult);
            return;
        }

        try {
            utils.setLoadingState(true, uiText.startingBinarySearch);
            binarySearch.updateInfo(uiText.searchingInitialRange);

            const { lower, upper } = await binarySearch.findInitialRange(channelName);

            binarySearch.updateInfo(`${uiText.rangeFound} ${lower} - ${upper}`);

            const lastPostId = await binarySearch.performBinarySearch(channelName, lower, upper);

            binarySearch.updateInfo(`${uiText.verifyingLastMessage} ${lastPostId}`);
            const finalExists = await messageChecker.checkExists(channelName, lastPostId);

            if (!finalExists) {
                throw new Error(uiText.noValidMessages);
            }

            cache.set(channelName, lastPostId);
            binarySearch.displayResult(channelName, lastPostId);

        } catch (error) {
            console.error('Error in binary search:', error);
            utils.showError(`${error.message}`);
            elements.loadChannelBtn.disabled = false;
            elements.loadChannelBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <span>${uiText.loadChannel}</span>
            `;
            utils.setLoadingState(false);
        }
    },
    async findInitialRange(channelName) {
        let lower = 1;
        let upper = 1;
        let foundAny = false;

        for (const testValue of binarySearch.testValues) {
            binarySearch.updateInfo(`${uiText.testingMessage} ${testValue}...`);
            const exists = await messageChecker.checkExists(channelName, testValue);

            if (exists) {
                lower = testValue;
            } else {
                upper = testValue;
                foundAny = true;
                break;
            }
        }

        if (!foundAny) {
            throw new Error('No messages found');
        }

        if (lower === binarySearch.testValues[binarySearch.testValues.length - 1]) {
            upper = lower * 2;
            while (await messageChecker.checkExists(channelName, upper)) {
                lower = upper;
                upper *= 2;
                binarySearch.updateInfo(`${uiText.testingMessage} ${upper}...`);
            }
        }

        return { lower, upper };
    },
    async performBinarySearch(channelName, lower, upper) {
        let lastValid = lower;
        let quickCheckDone = false;

        while (lower <= upper) {
            const mid = Math.floor((lower + upper) / 2);
            binarySearch.updateInfo(`${uiText.testingMessage} ${mid}...`);

            const exists = await messageChecker.checkExists(channelName, mid);

            if (exists) {
                lastValid = mid;
                lower = mid + 1;

                if (upper - mid < 10 && !quickCheckDone) {
                    quickCheckDone = true;
                    for (let i = mid + 1; i <= upper; i++) {
                        const quickExists = await messageChecker.checkExists(channelName, i);
                        if (quickExists) lastValid = i;
                        else break;
                    }
                    break;
                }
            } else {
                upper = mid - 1;
            }
        }

        if (lastValid > 0) {
            const forwardSteps = [10, 15, 20, 25, 30, 35, 40, 45, 50];
            for (const step of forwardSteps) {
                const nextId = lastValid + step;
                const exists = await messageChecker.checkExists(channelName, nextId);
                if (exists) {
                    lastValid = nextId;
                    for (let i = lastValid - step + 1; i < nextId; i++) {
                        binarySearch.updateInfo(`${uiText.testingMessage} ${i}...`);
                        const intermediateExists = await messageChecker.checkExists(channelName, i);
                        if (intermediateExists) lastValid = i;
                    }
                }
            }
        }

        return lastValid;
    },
    displayResult(channelName, lastPostId) {
        state.lastPostId = lastPostId;
        state.currentChannel = channelName;

        elements.currentChannel.innerHTML = `${uiText.currentlyViewing} <strong>@${channelName}</strong>`;
        elements.currentChannel.style.display = 'block';

        utils.setLoadingState(false);

        elements.widgetContainer.dataset.num = 20;
        elements.widgetContainer.innerHTML = '';

        elements.loadChannelBtn.disabled = false;
        elements.loadChannelBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span>${uiText.loadChannel}</span>
        `;

        window.dispatchEvent(new CustomEvent('telegramLoaded'));
    }
};

const api = {
    async fetchLastPost(channelName) {
        try {
            utils.setLoadingState(true, uiText.loadingLatestPost);
            elements.currentChannel.style.display = 'none';

            const url = CONFIG.API_URL.replace('{channel}', channelName);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const { data: { attributes: { last_message_id } } } = await response.json();

            if (!last_message_id) {
                throw new Error('No messages found');
            }

            binarySearch.displayResult(channelName, last_message_id);

        } catch (error) {
            console.error('Error fetching latest post:', error);
            utils.showError(`${error.message}`);
            elements.loadChannelBtn.disabled = false;
            elements.loadChannelBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <span>${uiText.loadChannel}</span>
            `;
            utils.setLoadingState(false);
        }
    }
};

const widgetLoader = {
    load(start, numPosts = CONFIG.NUM_POSTS) {
        if (!elements.widgetContainer) return;

        iframeMonitor.start();
        elements.loadMoreButton.style.display = 'flex';
        const end = start - numPosts + 1;

        const fragment = document.createDocumentFragment();

        for (let n = start; n >= end; n--) {
            const script = document.createElement('script');
            script.async = true;
            script.src = CONFIG.WIDGET_SCRIPT_URL;
            script.setAttribute('data-telegram-post', `${state.currentChannel}/${n}`);
            script.setAttribute('data-width', '100%');
            script.setAttribute('data-userpic', 'false');
            fragment.appendChild(script);
            state.countPosts++;
        }

        elements.widgetContainer.appendChild(fragment);

        if (end > 1) {
            widgetLoader.setupLoadMoreButton(end);
        } else {
            elements.loadMoreButton.style.display = 'none';
        }
    },

    setupLoadMoreButton(end) {
        const newButton = elements.loadMoreButton.cloneNode(true);
        elements.loadMoreButton.replaceWith(newButton);
        elements.loadMoreButton = newButton;

        elements.loadMoreButton.addEventListener('click', () => {
            if (state.countPosts > CONFIG.MAX_POSTS_BEFORE_CLEAR) {
                state.countPosts = 0;
                elements.widgetContainer.innerHTML = '';
                window.scrollTo(0, 0);
            }

            const newStart = end - 1;
            widgetLoader.load(newStart);
        });
    }
};

const iframeMonitor = {
    checkHeight() {
        const iframes = document.querySelectorAll('iframe[src*="t.me"]');
        iframes.forEach(iframe => {
            const { offsetHeight } = iframe;
            if (offsetHeight < CONFIG.MIN_IFRAME_HEIGHT && offsetHeight > 0) {
                iframe.style.display = 'none';
            }
        });

        state.countInterval++;
        if (state.intervalId && state.countInterval >= CONFIG.DELETED_POST_CHECK_MAX_TIMES) {
            clearInterval(state.intervalId);
            state.countInterval = 0;
            state.intervalId = null;
        }
    },

    start() {
        if (state.intervalId) {
            clearInterval(state.intervalId);
        }
        state.intervalId = setInterval(() => iframeMonitor.checkHeight(), CONFIG.DELETED_POST_CHECK_INTERVAL);
    }
};

const i18n = {
    updateUITexts() {
        document.getElementById('mainTitle').textContent = uiText.title;
        document.getElementById('enterChannelLabel').textContent = uiText.enterChannel;
        document.getElementById('byApiLabel').textContent = uiText.byApi;
        document.getElementById('byBinarySearchLabel').textContent = uiText.byBinarySearch;
        
        const btnContent = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span>${uiText.loadChannel}</span>
        `;
        if(!elements.loadChannelBtn.disabled) {
            elements.loadChannelBtn.innerHTML = btnContent;
        }

        const loadMoreContent = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            ${uiText.loadMore}
        `;
        elements.loadMoreButton.innerHTML = loadMoreContent;
    }
};

const eventListeners = {
    init() {
        i18n.updateUITexts();
        
        window.addEventListener('telegramLoaded', () => {
            if (elements.widgetContainer && state.lastPostId > 0) {
                state.countPosts = 0;
                const startPost = state.lastPostId + CONFIG.LOAD_MORE_POST;
                widgetLoader.load(startPost);
            }
        });

        elements.loadChannelBtn.addEventListener('click', async () => {
            const channelName = utils.extractChannelName(elements.channelInput.value);

            if (!channelName) {
                alert(uiText.invalidChannel);
                return;
            }

            if (state.isLoading) return;

            utils.clearContainer();
            elements.loadChannelBtn.disabled = true;
            elements.loadChannelBtn.textContent = uiText.loading;
            elements.error.style.display = 'none';

            try {
                const selectedMethod = document.querySelector('input[name="method"]:checked').value;
                const loadFunction = selectedMethod === 'api' ? api.fetchLastPost : binarySearch.findLastPost;
                await loadFunction(channelName);

                if (utils.saveChannel(channelName)) {
                    utils.displaySavedChannels();
                }
            } catch (error) {
                console.error('Error loading channel:', error);
                utils.showError(error.message);
            } finally {
                if(!state.isLoading) {
                    elements.loadChannelBtn.disabled = false;
                    elements.loadChannelBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <span>${uiText.loadChannel}</span>
                    `;
                }
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const channelParam = urlParams.get('channel');
            if (channelParam) {
                elements.channelInput.value = channelParam;
            }

            utils.addChannelsFromURL();
            utils.displaySavedChannels();
        });

        utils.addChannelsFromURL = function () {
            const urlParams = new URLSearchParams(window.location.search);
            const channelsToAdd = urlParams.get('add');

            if (channelsToAdd) {
                const channelsArray = channelsToAdd.split(',').map(ch => ch.trim()).filter(ch => ch);
                let addedAny = false;

                channelsArray.forEach(channel => {
                    if (utils.saveChannel(channel)) {
                        addedAny = true;
                    }
                });

                if (addedAny) {
                    utils.displaySavedChannels();
                }
            }
        };

        elements.channelInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                elements.loadChannelBtn.click();
            }
        });
    }
};

eventListeners.init();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((error) => {
            console.error('Error:', error);
        });
    });
}
