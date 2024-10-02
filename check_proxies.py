import threading
import queue
import requests

q = queue.Queue()
valid_proxies = []

# Read proxies from the file and put them into the queue
with open("proxy_list.txt", "r") as f:
    proxies = f.read().split("\n")
    for p in proxies:
        q.put(p)


def check_proxies():
    global q
    while not q.empty():
        proxy = q.get()
        try:
            # Set a timeout of 20 seconds for the request
            res = requests.get("http://ipinfo.io/json", 
                               proxies={"http": proxy, "https": proxy},
                               timeout=20)
            
            if res.status_code == 200:
                print(f"{proxy} is valid")
                valid_proxies.append(proxy)  # Add valid proxy to the list
        
            else:
                print(f"{proxy} did not work, status code: {res.status_code}")
        
        except requests.exceptions.Timeout:
            print(f"{proxy} timed out after 20 seconds.")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred with proxy {proxy}: {e}")
        finally:
            q.task_done()  # Mark this task as done in the queue


# Create and open the file to write valid proxies
def save_valid_proxies():
    with open("valid_proxies.txt", "w") as f:
        for proxy in valid_proxies:
            f.write(proxy + "\n")


# Start multiple threads to check proxies
for _ in range(10):
    threading.Thread(target=check_proxies).start()

# Wait for the queue to be empty
q.join()

# Save valid proxies to the file after checking
save_valid_proxies()
