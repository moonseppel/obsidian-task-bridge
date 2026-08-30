# General
1. If an action is irreversible, always ask the human first.
2. Never store passwords, API keys or other private data in the code. Explicitely warn me, when there is such a thing about to be committed to the code repository.
3. Do never commit or add files to git or modify git history in any way without explicitly being ordered to do so.
4. If you think a commit or other git command that is not allowed by the previous rule is a good idea, you need to prompt the human with the following information:
- Tell the human why the git command is a good idea and also about any risks involved.
- Print out all the commands to prepare the git staging area, ready to copy and paste. Do not execute the commands yourself.
- Print in a **separate** step the commands needed to execute the acutal git command, ready to copy and paste. Do not execute the commands yourself.
- If the above approach seems not feasible, tell the human.
5. Tie up all documentation loose ends before you start implementing.

# Security
1. If your code accepts input from an external source, the input must be sanizied before it is processed.
