import cloudscraper # For evading Cloudfare challenges
import hashlib
from pathlib import Path
import requests
from bs4 import BeautifulSoup
# from utils import get_canonical_url
# from utils import save_page

HTML_CACHE_DIR = Path("pages")
HTML_CACHE_DIR.mkdir(exist_ok=True)

HEADER = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0"
}

class Nairaland:
    def __init__(self, queue_filename, visited_filename, threshold):
        if Path(queue_filename).exists() and Path(visited_filename).exists():
            self.queue_filename = queue_filename
            self.visited_filename = visited_filename
            self.threshold = threshold
            self.visited = []
            self.queue = []
            self.successful = 0
            self.fail = 0
            self.scraper = requests.Session()
            self.scraper.headers.update(HEADER)
        
        else:
            raise FileNotFoundError("Queue file or visited file not found. Please confirm path given")

    def get_canonical_url(self, url):
        return url
    
    def load_url_list(self):
        # Get links in queue
        with open(self.queue_filename, 'r', encoding="utf-8") as f:
            queue = f.readlines()
        # Get visited links
        with open(self.visited_filename, 'r', encoding='utf-8') as f:
            visited = f.readlines()

        queue =  set([self.get_canonical_url(url) for url in queue])
        visited = set([self.get_canonical_url(url) for url in visited])
        self.queue = list(queue.difference(visited))
        self.visited = list(visited)
        return list(queue.difference(visited)), list(visited)
    
    def save_page(self, url, text):
        url_hash = hashlib.sha256(url.encode()).hexdigest()
        filepath = HTML_CACHE_DIR / f"{url_hash}.html"
        
        with open(filepath, 'w', encoding="utf-8") as f:
            f.write(text)

    def save_visited(self):
        with open(self.visited_filename, 'a', encoding="utf-8") as f:
            f.writelines([f"{url}\n" for url in self.visited])

    def report(self):
        print(f"Successfully retrieved {self.successful} urls")
        print(f"Failed to fetch {self.fail} urls")

    def run(self):
        queue, visited = self.load_url_list()
        print(f"Loaded {len(queue)} URLs from queue")
        for url in queue:
            try:
                url = url.strip()
                url_hash = hashlib.sha256(url.encode()).hexdigest()
                filepath = HTML_CACHE_DIR / f"{url_hash}.html"

                if filepath.exists():
                    print(f"Page at {url} already retrieved. Skipping")
                    self.visited.append(url)
                    continue

                response = self.scraper.get(url)
                
                if response.status_code == 200:
                    soup =  BeautifulSoup(response.text)
                    self.save_page(url, soup.prettify())
                    self.visited.append(url)
                    self.successful += 1
                else:
                    print(f"Failed to fetch {url}")
                    self.fail += 1

                if self.fail > self.threshold:
                    print(f"Number of failed request exceeded threshold: {self.threshold}")
                    print("Terminating script")
                    self.save_visited(visited, self.visited_filename)
                    break
            except Exception as e:
                print(f"Encountered exception: '{e}' while fetching page: {url}")
        print("Scraping run complete, fetched", self.successful, "pages")
        self.save_visited()


class Nairaland_CloudScraper(Nairaland):

    def __init__(self, queue_filename, visited_filename, threshold):
        super().__init__(queue_filename, visited_filename, threshold)
            
        self.scraper = cloudscraper.create_scraper(
            interpreter = "nodejs",
            delay=10,
            browser = {
                "browser": "chrome",
                "platform": "windows", 
                "mobile": False
            }
        )

if __name__ == "__main__":
    scraper = Nairaland_CloudScraper(r"queue.txt", r"visited.txt", 10)
    try:
        print("--------Beginning scraping run ----------------")
        scraper.run()
    except KeyboardInterrupt:
        scraper.save_visited()
        print("Ending scraping run")
