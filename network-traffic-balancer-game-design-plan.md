# Network Traffic Balancer
### A Digital Card Game About Managing Modern Networks

---

## **Overview**
Set in 2026, *Network Traffic Balancer* is a digital card game where players take on the role of network administrators. Your goal: manage traffic, handle crises, and balance budgets to keep services online and avoid financial disaster.

---

## **Core Concept**
Players oversee a data center, scheduling tasks and resolving events within time and budget constraints. The game emphasizes:
- Realistic network administration challenges
- Strategic time and resource management
- Financial consequences of decisions

---

Turn Phases (Final)

1. Draw Phase: Draw Traffic, Event, and Vendor cards.
2. Scheduling Phase: Allocate time slots for tasks (e.g., 2 hours for "4K Video Streams," 1 hour for "IoT Data Bursts").
3. Execution Phase: Resolve tasks within the allocated time.
4. Crisis Management Phase: Handle any unplanned events or emergencies.
5. Resolution Phase: Calculate reputation changes based on performance.
6. End Phase: Discard unused cards, draw new ones for the next turn.


---

## **Card Types**

### **Traffic Cards**
Represent incoming network demands:
- **4K Video Streams**
  - **Time:** 2 hours
  - **Cost:** $5,000
  - *High-bandwidth traffic from streaming services.*

- **IoT Data Bursts**
  - **Time:** 1 hour
  - **Cost:** $3,000
  - *Sudden data surges from connected devices.*

- **Cloud Backups**
  - **Time:** 3 hours
  - **Cost:** $7,000
  - *Scheduled data transfers to cloud storage.*

---

### **Vendor Cards**
Hardware and software solutions from real-world vendors:
- **Cisco Load Balancer**
  - **Cost:** $50,000
  - *Reduces traffic congestion by 50%.*

- **Cloudflare DDoS Protection**
  - **Cost:** $75,000
  - *Mitigates DDoS attacks, preventing losses.*

- **Juniper Firewall**
  - **Cost:** $60,000
  - *Enhances security, reducing breach risks.*

---

### **Event Cards**
Unplanned challenges with two resolution paths:

| **Event**               | **Mitigated Effect**                     | **Non-Mitigated Effect**                     |
|-------------------------|-----------------------------------------|---------------------------------------------|
| **DDoS Attack**         | Prevent $50,000 loss                    | Lose $50,000 + 1 hour downtime              |
| **AWS Outage**          | Prevent $75,000 loss                    | Lose $75,000 + 2 hours downtime             |
| **5G Tower Activation** | Gain $25,000 from improved service       | Lose $25,000 + 1 hour downtime              |

---

### **Action Cards**
Tactical decisions to optimize operations:
- Emergency Maintenance
- Traffic Prioritization
- Bandwidth Upgrade
- Security Patch
- Data Center Expansion

---

## **Board Layout**

### **Time Slots**
Divided into four periods with capacity limits:

| **Period**      | **Slots** | **Capacity** | **Purpose**                     |
|-----------------|-----------|--------------|---------------------------------|
| Morning         | 4         | 3 cards      | High-priority tasks             |
| Afternoon       | 4         | 3 cards      | Routine operations              |
| Evening         | 4         | 3 cards      | Maintenance & upgrades          |
| Overnight       | 8         | 3 cards      | Low-priority & automated tasks  |

**Overload Rule:** Exceeding slot capacity triggers "Network Overload," causing financial penalties and downtime.

---

### **Tracks**
- **Break/Fix:** Urgent issues requiring immediate attention.
- **Projects:** Planned upgrades and expansions.
- **Maintenance:** Routine system upkeep.

### **Vendor Slots**
- **Infrastructure Slots:** 4 dedicated slots for Vendor cards.
  - Each card provides continuous effects until replaced.

---

## **Win/Lose Conditions**

### **Win**
- Complete 12 rounds with a **positive budget**.
- Efficiently manage traffic and resolve events.

### **Lose**
- **Budget drops below -$100,000** (termination).
- Repeated SLA failures or network crashes.

---

## **Technology Stack**

| **Component**   | **Tools**                          |
|------------------|------------------------------------|
| **Frontend**     | TypeScript, HTML5 Canvas, PixiJS   |
| **Backend**      | Node.js (if needed)               |
| **Deployment**   | Capacitor (mobile), Electron (desktop) |
| **Development**  | VS Code                            |

---

## **Art Style**
- **Clean, modern UI** with retro-futuristic accents (e.g., neon grids).
- **Minimalist design** for performance on older devices.

---

## **Development Plan**

1. **Design**
   - Finalize card mechanics and UI wireframes.

2. **Prototype**
   - Set up TypeScript project.
   - Implement core logic with PixiJS.

3. **Test**
   - Optimize for cross-device performance.
   - Gather feedback and iterate.

4. **Release**
   - Publish as open-source (MIT License).
   - Credit trademarked vendor names.

---

## **Next Steps**
- Refine card effects or mechanics.
- Begin prototyping in TypeScript/PixiJS.