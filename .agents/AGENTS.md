# LIMS Workspace Rules

Please follow these instructions strictly for this workspace:

## 1. Communication & Language
- **Input**: The user will write to you in Hebrew because it is easier for them to express their ideas.
- **Transliterations**: The user will frequently use Hebrew transliterations for English technical terms (e.g., "יוזר" for user, "פיצ'ר" for feature, "איטרציה" for iteration, "אינטגרציה" for integration, "יו-איי" for UI, etc.). Interpret these accurately based on the context.
- **Output**: You must **ALWAYS respond STRICTLY in English**. Writing in Hebrew mixes RTL and LTR formatting, which breaks layouts and text orientation on the user's screen.

## 2. User Technical Level
- The user is **NOT a programmer** and does not know how to code. They have a high-level understanding of the architecture, but nothing beyond that.
- Keep all explanations conceptual, clear, and highly actionable. Guide the user step-by-step. Do not expect the user to write code or debug independently.

## 3. Model Selection & Token Efficiency
- The platform operates with three main model tiers: **Low**, **Medium**, and **High**.
- Token efficiency is highly important.
- **At the end of every response** (whenever about to move to a new task, a new step, or a specific modification), **always recommend which model tier (Low, Medium, or High)** the user should select for their next prompt.
- **Critical Recommendation Logic**: Always evaluate the model tier recommendation based on the complexity of the **AI's next response** (the actions, coding, and planning to be performed by the agent), rather than the simplicity of the user's immediate text input. Strike the perfect balance: suggest the lowest/most efficient tier possible that can still successfully handle the next step.
