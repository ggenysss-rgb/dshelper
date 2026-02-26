import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'dark' | 'light';
type Design = 'midnight' | 'arctic' | 'sunset' | 'neon';

const DESIGN_SCENES: { id: Design; label: string; theme: Theme }[] = [
    { id: 'midnight', label: 'Midnight Pulse', theme: 'dark' },
    { id: 'arctic', label: 'Arctic Glass', theme: 'light' },
    { id: 'sunset', label: 'Sunset Bloom', theme: 'light' },
    { id: 'neon', label: 'Neon Grid', theme: 'dark' },
];

const DESIGN_CLASSES = DESIGN_SCENES.map(scene => `design-${scene.id}`);

const isTheme = (value: string | null): value is Theme => value === 'dark' || value === 'light';
const isDesign = (value: string | null): value is Design => DESIGN_SCENES.some(scene => scene.id === value);

const resolveScene = (design: Design) => DESIGN_SCENES.find(scene => scene.id === design) || DESIGN_SCENES[0];

type ThemeContextType = {
    theme: Theme;
    design: Design;
    designLabel: string;
    toggleTheme: () => void;
    cycleDesign: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('dashboard_theme');
        if (isTheme(savedTheme)) return savedTheme;
        return DESIGN_SCENES[0].theme;
    });

    const [design, setDesign] = useState<Design>(() => {
        const savedDesign = localStorage.getItem('dashboard_design');
        if (isDesign(savedDesign)) return savedDesign;
        return DESIGN_SCENES[0].id;
    });

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('dark', 'light', ...DESIGN_CLASSES);
        root.classList.add(theme, `design-${design}`);
        localStorage.setItem('dashboard_theme', theme);
        localStorage.setItem('dashboard_design', design);
    }, [theme, design]);

    const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
    const cycleDesign = () => {
        setDesign(current => {
            const currentIndex = DESIGN_SCENES.findIndex(scene => scene.id === current);
            const nextScene = DESIGN_SCENES[(currentIndex + 1) % DESIGN_SCENES.length];
            setTheme(nextScene.theme);
            return nextScene.id;
        });
    };
    const currentScene = resolveScene(design);

    return (
        <ThemeContext.Provider value={{ theme, design, designLabel: currentScene.label, toggleTheme, cycleDesign }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
};
