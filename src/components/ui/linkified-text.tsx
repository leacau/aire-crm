
import React from 'react';

const urlRegex = /(https?:\/\/[^\s]+|[wW]{3}\.[^\s]+)/g;

export function LinkifiedText({ text }: { text: string }) {
    if (!text) {
        return null;
    }

    const parts = text.split(urlRegex);

    return (
        <p className="whitespace-pre-wrap">
            {parts.map((part, index) => {
                if (part && part.match(urlRegex)) {
                    let href = part;
                    if (part.toLowerCase().startsWith('www.')) {
                        href = `http://${part}`;
                    }
                    return (
                        <a
                            key={index}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline hover:text-primary/80"
                            onClick={(e) => e.stopPropagation()} // Prevent triggering parent onClick events
                        >
                            {part}
                        </a>
                    );
                }
                return <React.Fragment key={index}>{part}</React.Fragment>;
            })}
        </p>
    );
}
