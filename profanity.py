from better_profanity import profanity

# Load the built-in list
profanity.load_censor_words()

# Add your own school-specific / German words
EXTRA_WORDS = [
    'idiot', 'stupid', 'loser', 'freak', 'ugly', 'retard', 'moron',
    'dumb', 'pathetic', 'worthless', 'trash', 'hate',
    # German
    'idiot', 'dummkopf', 'arschloch', 'blödmann', 'vollidiot',
    'trottel', 'depp', 'miststück', 'wichser',
]
profanity.add_censor_words(EXTRA_WORDS)

def contains_bullying(text: str) -> bool:
    """Return True if the text contains a flagged word."""
    if not text:
        return False
    return profanity.contains_profanity(text)

def censor(text: str) -> str:
    """Replace flagged words with asterisks."""
    if not text:
        return text
    return profanity.censor(text)