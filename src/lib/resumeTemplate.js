// The fixed LaTeX preamble for tailored resumes. The model only ever writes
// the document body using the macros defined here, so the layout cannot drift
// between runs and the in-page preview knows every command it has to draw.
// Standard packages only: this compiles with plain pdflatex anywhere.
export const PREAMBLE = String.raw`\documentclass[10pt,letterpaper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage[top=0.45in,bottom=0.45in,left=0.5in,right=0.5in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\input{glyphtounicode}
\pdfgentounicode=1
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\raggedbottom
\titleformat{\section}{\bfseries\normalsize}{}{0pt}{\MakeUppercase}[\vspace{-5pt}\rule{\linewidth}{0.5pt}]
\titlespacing*{\section}{0pt}{7pt}{3pt}

% \resumeheader{Name}{contact line}
\newcommand{\resumeheader}[2]{\begin{center}{\LARGE\bfseries #1}\\[3pt]{\small #2}\end{center}\vspace{-8pt}}
% \entry{Role, Organization, Location}{Dates or right-hand note}
\newcommand{\entry}[2]{\vspace{2pt}\textbf{#1}\hfill #2\par}
% \plainline{left text}{right text}
\newcommand{\plainline}[2]{#1\hfill #2\par}
% \skillline{LABEL}{comma separated skills}
\newcommand{\skillline}[2]{\textbf{#1:} #2\par}
\newenvironment{bullets}{\begin{itemize}[leftmargin=14pt,itemsep=0pt,topsep=1pt,parsep=0pt,partopsep=0pt]\small}{\end{itemize}}
`;

export const wrapDocument = (body) =>
    `${PREAMBLE}\n\\begin{document}\n${body.trim()}\n\\end{document}\n`;

/** Pull the body back out of a full document the user may have edited. */
export const extractBody = (tex) => {
    const m = tex.match(/\\begin\{document\}([\s\S]*?)(?:\\end\{document\}|$)/);
    return (m ? m[1] : tex).trim();
};

// Shown to the model as the house style. Deliberately generic content.
export const BODY_EXAMPLE = String.raw`\resumeheader{Jordan Example}{jordan@example.com | 555-010-0199 | \href{https://example.com}{example.com}}

\section{Objective}
One line naming the role and what the candidate brings to it.

\section{Education}
\entry{State University, City, ST}{Expected May 2027}
\plainline{Bachelor of Science in Electrical Engineering}{GPA 3.7}

\section{Skills}
\skillline{Hardware}{Oscilloscope, Logic Analyzer, Soldering}
\skillline{Software}{C, Python, MATLAB}

\section{Professional Experience}
\entry{Hardware Engineering Intern, Example Corp, City, ST}{May 2026 - Aug 2026}
\begin{bullets}
\item Validated a 4 layer sensor board against a 12 item test plan, catching 3 faults before release
\item Wrote Python scripts that cut bench data reduction from 2 hours to 10 minutes
\end{bullets}

\section{Projects}
\entry{Project Name (ESP32, C++, BLE)}{Team Lead, 4 Person Team}
\begin{bullets}
\item One accomplishment with a number in it
\end{bullets}`;
