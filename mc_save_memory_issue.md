Problem: mcp_memory_save_memory rejects observations with "Too many sentences" error

Rejected Examples:
1. "Library: python-docx version 1.2.0" - rejected as "3 sentences"
2. "10 replaced with 21 numbers" - rejected
3. "26 rows deleted, 21 added" - rejected

Recommendations:
1. Increase limit to 3-4 sentences for technical facts
2. Don't count colons and list items as separate sentences
3. Add correct formatting examples to documentation
4. For complex projects, 150 chars + 2 sentences is too restrictive

Context: Attempted to save project details with 13+ entities,
all attempts (6+) rejected due to "sentence limit"

Use Case: Saving structured project data with:
- File paths and names
- Version numbers
- Technical specifications
- Task descriptions with numbers/metrics

Current validation makes it nearly impossible to save 
real-world technical project information atomically.

